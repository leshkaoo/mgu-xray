package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"local/mgu-xray/internal/profile"
	"net"
	"net/url"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"
)

var supervisorBinary, helperBinary, helperDigest string

// The test executable doubles as an engine fixture. The real supervisor copies
// and checksums it, then invokes it with the same arguments used for Xray.
func TestMain(m *testing.M) {
	if len(os.Args) > 1 && os.Args[1] == "run" {
		os.Exit(mockEngine())
	}
	dir, err := os.MkdirTemp("", "mgu-xray-tests-")
	if err != nil {
		panic(err)
	}
	supervisorBinary = filepath.Join(dir, "supervisor")
	cmd := exec.Command("go", "build", "-o", supervisorBinary, ".")
	if out, err := cmd.CombinedOutput(); err != nil {
		fmt.Fprintf(os.Stderr, "build supervisor: %v\n%s", err, out)
		os.RemoveAll(dir)
		os.Exit(1)
	}
	helperBinary, err = os.Executable()
	if err != nil {
		panic(err)
	}
	b, err := os.ReadFile(helperBinary)
	if err != nil {
		panic(err)
	}
	h := sha256.Sum256(b)
	helperDigest = hex.EncodeToString(h[:])
	code := m.Run()
	_ = os.RemoveAll(dir)
	os.Exit(code)
}

func mockEngine() int {
	var c profile.Config
	if json.NewDecoder(os.Stdin).Decode(&c) != nil || len(c.Outbounds) != 1 {
		return 9
	}
	o := c.Outbounds[0]
	mode := o.Settings.Servers[0].Address
	marker := o.Stream.Reality.SpiderX
	phase := "run"
	for _, a := range os.Args {
		if a == "-test" {
			phase = "check"
		}
	}
	f, err := os.OpenFile(marker+".events", os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
	if err != nil {
		return 9
	}
	fmt.Fprintln(f, phase)
	f.Close()
	// All fixture diagnostics must be swallowed by the supervisor.
	fmt.Fprintln(os.Stdout, "SECRET-FIXTURE-DIAGNOSTIC", o.Settings.Servers[0].Users[0].ID)
	fmt.Fprintln(os.Stderr, "SECRET-FIXTURE-DIAGNOSTIC", o.Stream.Reality.PublicKey)
	if phase == "check" {
		if mode == "invalid.invalid" {
			return 7
		}
		return 0
	}
	if mode == "crash.invalid" {
		return 7
	}
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGTERM, os.Interrupt)
	_ = os.WriteFile(marker+".pid", []byte(strconv.Itoa(os.Getpid())), 0600)
	<-sig
	_ = os.WriteFile(marker+".terminated", []byte("yes"), 0600)
	return 0
}

const testUUID = "00000000-0000-4000-8000-000000000001"
const testKey = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"

func testURI(mode, marker string) string {
	q := url.Values{"type": {"tcp"}, "security": {"reality"}, "sni": {"localhost"}, "fp": {"chrome"}, "pbk": {testKey}, "sid": {"0123456789abcdef"}, "spx": {marker}}
	return "vless://" + testUUID + "@" + mode + ":14443?" + q.Encode()
}

func freePorts(t *testing.T) (int, int) {
	t.Helper()
	a, e := net.Listen("tcp", "127.0.0.1:0")
	if e != nil {
		t.Fatal(e)
	}
	defer a.Close()
	b, e := net.Listen("tcp", "127.0.0.1:0")
	if e != nil {
		t.Fatal(e)
	}
	defer b.Close()
	return a.Addr().(*net.TCPAddr).Port, b.Addr().(*net.TCPAddr).Port
}

func supervisorCommand(ctx context.Context, t *testing.T, mode string, ports ...int) (*exec.Cmd, string, string) {
	t.Helper()
	dir := t.TempDir()
	marker := filepath.Join(dir, "fixture")
	a, b := freePorts(t)
	if len(ports) == 2 {
		a, b = ports[0], ports[1]
	}
	cmd := exec.CommandContext(ctx, supervisorBinary, "-run", "-engine", helperBinary, "-engine-sha256", helperDigest, "-socks-port", strconv.Itoa(a), "-http-port", strconv.Itoa(b))
	cmd.Stdin = strings.NewReader(testURI(mode, marker))
	cmd.Env = append(os.Environ(), "TMPDIR="+dir)
	return cmd, marker, dir
}

func assertRedacted(t *testing.T, out []byte) {
	t.Helper()
	for _, secret := range []string{"SECRET-FIXTURE-DIAGNOSTIC", testUUID, testKey} {
		if bytes.Contains(out, []byte(secret)) {
			t.Fatal("secret-bearing child diagnostic escaped")
		}
	}
}

func assertRuntimeRemoved(t *testing.T, dir string) {
	t.Helper()
	entries, _ := filepath.Glob(filepath.Join(dir, "mgu-xray-*"))
	if len(entries) != 0 {
		t.Fatalf("private runtime not removed: %v", entries)
	}
}

func TestEngineDigestMismatchDoesNotExecute(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	cmd, marker, dir := supervisorCommand(ctx, t, "wait.invalid")
	for i, arg := range cmd.Args {
		if arg == "-engine-sha256" {
			cmd.Args[i+1] = strings.Repeat("0", 64)
		}
	}
	out, err := cmd.CombinedOutput()
	if err == nil || !bytes.Contains(out, []byte("SHA256 mismatch")) {
		t.Fatalf("expected digest refusal: %v %s", err, out)
	}
	if _, err := os.Stat(marker + ".events"); !os.IsNotExist(err) {
		t.Fatal("engine executed despite mismatched digest")
	}
	assertRedacted(t, out)
	assertRuntimeRemoved(t, dir)
}

func TestPortConflictPreservesExistingListener(t *testing.T) {
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer l.Close()
	_, other := freePorts(t)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	cmd, marker, dir := supervisorCommand(ctx, t, "wait.invalid", l.Addr().(*net.TCPAddr).Port, other)
	out, err := cmd.CombinedOutput()
	if err == nil || !bytes.Contains(out, []byte("proxy port unavailable")) {
		t.Fatalf("expected port refusal: %v %s", err, out)
	}
	if _, err := os.Stat(marker + ".events"); !os.IsNotExist(err) {
		t.Fatal("engine executed on port conflict")
	}
	conn, err := net.DialTimeout("tcp", l.Addr().String(), time.Second)
	if err != nil {
		t.Fatalf("existing listener was disrupted: %v", err)
	}
	conn.Close()
	assertRuntimeRemoved(t, dir)
}

func TestEngineValidationFailureIsRedacted(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	cmd, marker, dir := supervisorCommand(ctx, t, "invalid.invalid")
	out, err := cmd.CombinedOutput()
	if err == nil || !bytes.Contains(out, []byte("validation failed")) {
		t.Fatalf("expected failed validation: %v %s", err, out)
	}
	b, _ := os.ReadFile(marker + ".events")
	if string(b) != "check\n" {
		t.Fatalf("runtime started after failed validation: %q", b)
	}
	assertRedacted(t, out)
	assertRuntimeRemoved(t, dir)
}

func TestCrashRetryBudgetAndRedaction(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 35*time.Second)
	defer cancel()
	cmd, marker, dir := supervisorCommand(ctx, t, "crash.invalid")
	out, err := cmd.CombinedOutput()
	if err == nil || !bytes.Contains(out, []byte("retry budget exhausted")) {
		t.Fatalf("expected exhausted retry budget: %v %s", err, out)
	}
	b, _ := os.ReadFile(marker + ".events")
	if string(b) != "check\nrun\nrun\nrun\nrun\n" {
		t.Fatalf("unexpected engine invocation budget: %q", b)
	}
	assertRedacted(t, out)
	assertRuntimeRemoved(t, dir)
}

func waitFile(t *testing.T, path string) string {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		if b, err := os.ReadFile(path); err == nil && len(b) > 0 {
			return string(b)
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for fixture readiness: %s", path)
	return ""
}

func TestSIGTERMCleansEngineAndPrivateRuntime(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	cmd, marker, dir := supervisorCommand(ctx, t, "wait.invalid")
	var out bytes.Buffer
	cmd.Stdout, cmd.Stderr = &out, &out
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if cmd.ProcessState == nil {
			_ = cmd.Process.Kill()
			_ = cmd.Wait()
		}
	})
	pid, _ := strconv.Atoi(waitFile(t, marker+".pid"))
	runtimes, _ := filepath.Glob(filepath.Join(dir, "mgu-xray-*"))
	if len(runtimes) != 1 {
		t.Fatalf("expected one private runtime, got %v", runtimes)
	}
	files, err := os.ReadDir(runtimes[0])
	if err != nil || len(files) != 1 || files[0].Name() != "xray" {
		t.Fatalf("runtime must contain only frozen executable, not credential files: %v %v", files, err)
	}
	info, err := os.Stat(runtimes[0])
	if err != nil || info.Mode().Perm() != 0700 {
		t.Fatal("private runtime permissions are not 0700")
	}
	if err := cmd.Process.Signal(syscall.SIGTERM); err != nil {
		t.Fatal(err)
	}
	if err := cmd.Wait(); err != nil {
		t.Fatalf("graceful stop failed: %v %s", err, out.String())
	}
	if _, err := os.Stat(marker + ".terminated"); err != nil {
		t.Fatal("engine did not receive graceful termination")
	}
	if syscall.Kill(pid, 0) == nil {
		t.Fatal("engine still running after supervisor stopped")
	}
	assertRedacted(t, out.Bytes())
	assertRuntimeRemoved(t, dir)
}
