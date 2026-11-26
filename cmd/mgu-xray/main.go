// Local-only engineering prototype. No vehicle installation or service changes.
package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"local/mgu-xray/internal/profile"
	"net"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
func run() error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	f := flag.NewFlagSet("mgu-xray", flag.ContinueOnError)
	engine := f.String("engine", "", "absolute path to pinned Xray executable")
	digest := f.String("engine-sha256", "", "required SHA256 from trusted local build manifest")
	socksPort := f.Int("socks-port", 10808, "loopback SOCKS5 port (override for isolated local testing)")
	httpPort := f.Int("http-port", 10809, "loopback HTTP port (override for isolated local testing)")
	start := f.Bool("run", false, "run validated profile until interrupted (local prototype only)")
	parentPID := f.Int("parent-pid", 0, "optional owning UI PID; stop when it exits")
	if e := f.Parse(os.Args[1:]); e != nil {
		return e
	}
	if f.NArg() != 0 {
		return errors.New("pass profile via stdin, not arguments")
	}
	if *parentPID < 0 || (*parentPID != 0 && *parentPID != os.Getppid()) {
		return errors.New("owning UI is not this process parent")
	}
	if *parentPID != 0 {
		go watchParent(ctx, stop, *parentPID, 500*time.Millisecond, os.Getppid)
	}
	c, e := profile.Read(os.Stdin)
	if e != nil {
		return e
	}
	if *socksPort < 1024 || *socksPort > 65535 || *httpPort < 1024 || *httpPort > 65535 || *httpPort == *socksPort {
		return errors.New("distinct unprivileged proxy ports required")
	}
	c.Inbounds[0].Port = *socksPort
	c.Inbounds[1].Port = *httpPort
	if !*start {
		fmt.Printf("valid: VLESS TCP REALITY; SOCKS5 127.0.0.1:%d; HTTP 127.0.0.1:%d; UDP disabled\n", *socksPort, *httpPort)
		return nil
	}
	if !filepath.IsAbs(*engine) {
		return errors.New("engine must be an absolute path")
	}
	expected, err := hex.DecodeString(*digest)
	if err != nil || len(expected) != sha256.Size {
		return errors.New("engine SHA256 required")
	}
	// Reserve both ports before writing any secrets. Xray rebinds after release;
	// a competing process causes a bounded failure, never a kill of that process.
	listeners := []net.Listener{}
	defer func() {
		for _, l := range listeners {
			l.Close()
		}
	}()
	for _, p := range []string{fmt.Sprintf("127.0.0.1:%d", *socksPort), fmt.Sprintf("127.0.0.1:%d", *httpPort)} {
		l, err := net.Listen("tcp", p)
		if err != nil {
			for _, l := range listeners {
				l.Close()
			}
			return errors.New("proxy port unavailable; no process changed")
		}
		listeners = append(listeners, l)
	}
	dir, e := os.MkdirTemp("", "mgu-xray-")
	if e != nil {
		for _, l := range listeners {
			l.Close()
		}
		return errors.New("cannot create private runtime")
	}
	defer os.RemoveAll(dir)
	verifiedEngine, e := freezeEngine(*engine, expected, dir)
	if e != nil {
		return e
	}
	data, _ := json.Marshal(c)
	for _, l := range listeners {
		l.Close()
	}
	// Preflight output is deliberately discarded: engine diagnostics may contain secrets.
	checkCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	check := exec.CommandContext(checkCtx, verifiedEngine, "run", "-test", "-format", "json", "-config", "stdin:")
	check.SysProcAttr = childAttributes()
	check.Cancel = func() error { return syscall.Kill(-check.Process.Pid, syscall.SIGKILL) }
	check.Stdin = bytes.NewReader(data)
	check.Env = []string{"GOGC=30", "GOMEMLIMIT=64MiB"}
	check.Stdout = io.Discard
	check.Stderr = io.Discard
	e = check.Run()
	cancel()
	if e != nil {
		return errors.New("engine validation failed (details suppressed)")
	}
	for attempt := 0; attempt < 4; attempt++ {
		if ctx.Err() != nil {
			return nil
		}
		cmd := exec.Command(verifiedEngine, "run", "-format", "json", "-config", "stdin:")
		cmd.Stdin = bytes.NewReader(data)
		cmd.SysProcAttr = childAttributes()
		cmd.Stdout = io.Discard
		cmd.Stderr = io.Discard
		cmd.Env = []string{"GOGC=30", "GOMEMLIMIT=64MiB"}
		if e = cmd.Start(); e != nil {
			return errors.New("engine could not start")
		}
		done := make(chan error, 1)
		go func() { done <- cmd.Wait() }()
		fmt.Println("engine started; upstream connectivity not yet verified")
		select {
		case <-ctx.Done():
			_ = syscall.Kill(-cmd.Process.Pid, syscall.SIGTERM)
			select {
			case <-done:
			case <-time.After(5 * time.Second):
				_ = syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
				<-done
			}
			return nil
		case <-done:
			fmt.Println("engine stopped; bounded retry")
		}
		timer := time.NewTimer(time.Duration(1<<attempt) * time.Second)
		select {
		case <-ctx.Done():
			timer.Stop()
			return nil
		case <-timer.C:
		}
	}
	return errors.New("engine retry budget exhausted; stopped")
}

// A foreground app owns this supervisor. No daemon or boot registration is
// needed: loss of the UI parent cancels normal supervision and stops Xray.
func watchParent(ctx context.Context, cancel context.CancelFunc, expected int, interval time.Duration, getParent func() int) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if getParent() != expected {
				cancel()
				return
			}
		}
	}
}

// Copy and hash the same bytes in one pass. The private copy is not executable
// until it matches the trusted build manifest. No unbounded binary allocation.
func freezeEngine(source string, expected []byte, dir string) (string, error) {
	in, e := os.Open(source)
	if e != nil {
		return "", errors.New("cannot read engine")
	}
	defer in.Close()
	info, e := in.Stat()
	if e != nil || !info.Mode().IsRegular() || info.Size() > 128<<20 {
		return "", errors.New("invalid engine file")
	}
	path := filepath.Join(dir, "xray")
	out, e := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if e != nil {
		return "", errors.New("cannot write private runtime")
	}
	h := sha256.New()
	n, e := io.Copy(io.MultiWriter(out, h), io.LimitReader(in, (128<<20)+1))
	closeErr := out.Close()
	if e != nil || closeErr != nil || n > 128<<20 {
		return "", errors.New("cannot copy engine")
	}
	if !bytes.Equal(h.Sum(nil), expected) {
		return "", errors.New("engine SHA256 mismatch")
	}
	if os.Chmod(path, 0700) != nil {
		return "", errors.New("cannot prepare engine")
	}
	return path, nil
}
