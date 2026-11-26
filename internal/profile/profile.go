// Package profile accepts a deliberately small, fail-closed subset of Xray.
package profile

import (
	"bytes"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/url"
	"regexp"
	"strconv"
	"strings"
)

const MaxSize = 65536

var ErrInvalid = errors.New("profile rejected: expected one VLESS TCP REALITY server; unsupported or invalid fields")
var uuid = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
var hostname = regexp.MustCompile(`^[a-zA-Z0-9](?:[a-zA-Z0-9.-]{0,251}[a-zA-Z0-9])?$`)

type User struct {
	ID         string `json:"id"`
	Encryption string `json:"encryption"`
	Flow       string `json:"flow,omitempty"`
}
type Server struct {
	Address string `json:"address"`
	Port    int    `json:"port"`
	Users   []User `json:"users"`
}
type Reality struct {
	ServerName  string `json:"serverName"`
	Fingerprint string `json:"fingerprint"`
	PublicKey   string `json:"publicKey,omitempty"`
	Password    string `json:"password,omitempty"`
	ShortID     string `json:"shortId"`
	SpiderX     string `json:"spiderX,omitempty"`
}
type Stream struct {
	Network  string  `json:"network"`
	Security string  `json:"security"`
	Reality  Reality `json:"realitySettings"`
}
type Outbound struct {
	Tag      string `json:"tag,omitempty"`
	Protocol string `json:"protocol"`
	Settings struct {
		Servers []Server `json:"vnext"`
	} `json:"settings"`
	Stream Stream `json:"streamSettings"`
}
type Inbound struct {
	Tag      string `json:"tag"`
	Listen   string `json:"listen"`
	Port     int    `json:"port"`
	Protocol string `json:"protocol"`
	Settings struct {
		Auth string `json:"auth,omitempty"`
		UDP  bool   `json:"udp,omitempty"`
	} `json:"settings"`
}
type Config struct {
	Log struct {
		Level string `json:"loglevel"`
	} `json:"log"`
	Inbounds  []Inbound  `json:"inbounds"`
	Outbounds []Outbound `json:"outbounds"`
}

func Read(r io.Reader) (Config, error) {
	b, err := io.ReadAll(io.LimitReader(r, MaxSize+1))
	if err != nil || len(b) > MaxSize {
		return Config{}, ErrInvalid
	}
	return Parse(b)
}
func Parse(b []byte) (Config, error) {
	if len(b) == 0 || len(b) > MaxSize {
		return Config{}, ErrInvalid
	}
	b = bytes.TrimSpace(b)
	var o Outbound
	if bytes.HasPrefix(b, []byte("vless://")) {
		u, e := url.Parse(string(b))
		if e != nil || u.Scheme != "vless" || u.User == nil || u.Path != "" || u.Opaque != "" {
			return Config{}, ErrInvalid
		}
		if _, p := u.User.Password(); p {
			return Config{}, ErrInvalid
		}
		q, e := url.ParseQuery(u.RawQuery)
		if e != nil {
			return Config{}, ErrInvalid
		}
		allowed := map[string]bool{"type": true, "security": true, "encryption": true, "flow": true, "sni": true, "fp": true, "pbk": true, "sid": true, "spx": true}
		for k, v := range q {
			if !allowed[k] || len(v) != 1 {
				return Config{}, ErrInvalid
			}
		}
		if q.Get("type") != "tcp" || q.Get("security") != "reality" || (q.Get("encryption") != "" && q.Get("encryption") != "none") {
			return Config{}, ErrInvalid
		}
		port, e := strconv.Atoi(u.Port())
		if e != nil {
			return Config{}, ErrInvalid
		}
		o.Protocol = "vless"
		o.Settings.Servers = []Server{{Address: u.Hostname(), Port: port, Users: []User{{ID: u.User.Username(), Encryption: "none", Flow: q.Get("flow")}}}}
		o.Stream = Stream{Network: "tcp", Security: "reality", Reality: Reality{ServerName: q.Get("sni"), Fingerprint: q.Get("fp"), PublicKey: q.Get("pbk"), ShortID: q.Get("sid"), SpiderX: q.Get("spx")}}
	} else {
		// Reject duplicate keys as well as unknown keys: ambiguous input is never executed.
		if !uniqueJSON(b) {
			return Config{}, ErrInvalid
		}
		var c Config
		d := json.NewDecoder(bytes.NewReader(b))
		d.DisallowUnknownFields()
		if d.Decode(&c) != nil || d.Decode(new(any)) != io.EOF || len(c.Outbounds) != 1 {
			return Config{}, ErrInvalid
		}
		for _, in := range c.Inbounds {
			if in.Listen != "127.0.0.1" || in.Settings.UDP || in.Settings.Auth != "" && in.Settings.Auth != "noauth" || !((in.Protocol == "socks" && in.Port == 10808) || (in.Protocol == "http" && in.Port == 10809)) {
				return Config{}, ErrInvalid
			}
		}
		if len(c.Inbounds) > 2 || c.Log.Level != "" && c.Log.Level != "none" && c.Log.Level != "error" && c.Log.Level != "warning" {
			return Config{}, ErrInvalid
		}
		o = c.Outbounds[0]
	}
	if !valid(o) {
		return Config{}, ErrInvalid
	}
	o.Tag = "proxy"
	// Only generated listeners and outbound survive import. No routes, exec,
	// includes, DNS, API, paths, or direct fallback can be supplied by profiles.
	c := Config{Outbounds: []Outbound{o}}
	c.Log.Level = "none"
	c.Inbounds = []Inbound{{Tag: "socks", Listen: "127.0.0.1", Port: 10808, Protocol: "socks"}, {Tag: "http", Listen: "127.0.0.1", Port: 10809, Protocol: "http"}}
	c.Inbounds[0].Settings.Auth = "noauth"
	return c, nil
}
func valid(o Outbound) bool {
	if o.Protocol != "vless" || len(o.Settings.Servers) != 1 || o.Stream.Network != "tcp" || o.Stream.Security != "reality" {
		return false
	}
	s := o.Settings.Servers[0]
	if !(hostname.MatchString(s.Address) || net.ParseIP(s.Address) != nil) || s.Port < 1 || s.Port > 65535 || len(s.Users) != 1 {
		return false
	}
	u := s.Users[0]
	if !uuid.MatchString(u.ID) || u.Encryption != "none" || u.Flow != "" && u.Flow != "xtls-rprx-vision" {
		return false
	}
	r := o.Stream.Reality
	if !hostname.MatchString(r.ServerName) {
		return false
	}
	switch r.Fingerprint {
	case "chrome", "firefox", "safari", "edge", "ios", "android":
	default:
		return false
	}
	key := r.PublicKey
	if r.Password != "" {
		if key != "" {
			return false
		}
		key = r.Password
	}
	k, e := base64.RawURLEncoding.DecodeString(key)
	if e != nil || len(k) != 32 || base64.RawURLEncoding.EncodeToString(k) != key {
		return false
	}
	sid, e := hex.DecodeString(r.ShortID)
	if e != nil || len(sid) > 8 {
		return false
	}
	if len(r.SpiderX) > 256 || strings.ContainsAny(r.SpiderX, "\r\n\x00") || r.SpiderX != "" && !strings.HasPrefix(r.SpiderX, "/") {
		return false
	}
	return true
}
func uniqueJSON(b []byte) bool {
	d := json.NewDecoder(bytes.NewReader(b))
	var walk func(int) bool
	walk = func(depth int) bool {
		if depth > 32 {
			return false
		}
		t, e := d.Token()
		if e != nil {
			return false
		}
		x, ok := t.(json.Delim)
		if !ok {
			return true
		}
		switch x {
		case '{':
			seen := map[string]bool{}
			for d.More() {
				k, e := d.Token()
				s, ok := k.(string)
				if e != nil || !ok || seen[s] {
					return false
				}
				switch s {
				case "log", "loglevel", "inbounds", "outbounds", "tag", "listen", "port", "protocol", "settings", "auth", "udp", "vnext", "address", "users", "id", "encryption", "flow", "streamSettings", "network", "security", "realitySettings", "serverName", "fingerprint", "publicKey", "password", "shortId", "spiderX":
				default:
					return false
				}
				seen[s] = true
				if !walk(depth + 1) {
					return false
				}
			}
			end, e := d.Token()
			return e == nil && end == json.Delim('}')
		case '[':
			for d.More() {
				if !walk(depth + 1) {
					return false
				}
			}
			end, e := d.Token()
			return e == nil && end == json.Delim(']')
		}
		return false
	}
	if !walk(0) {
		return false
	}
	_, e := d.Token()
	return e == io.EOF
}
