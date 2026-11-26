package profile

import (
	"encoding/json"
	"strings"
	"testing"
)

const fixture = "vless://00000000-0000-4000-8000-000000000001@127.0.0.1:14443?type=tcp&security=reality&encryption=none&flow=xtls-rprx-vision&sni=localhost&fp=chrome&pbk=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA&sid=0123456789abcdef"

func TestRoundTripAndListeners(t *testing.T) {
	c, e := Parse([]byte(fixture))
	if e != nil {
		t.Fatal(e)
	}
	b, _ := json.Marshal(c)
	c, e = Parse(b)
	if e != nil {
		t.Fatal(e)
	}
	if len(c.Inbounds) != 2 || c.Inbounds[0].Settings.UDP || c.Inbounds[0].Listen != "127.0.0.1" || c.Log.Level != "none" {
		t.Fatal("unsafe generated config")
	}
}
func TestRejectURI(t *testing.T) {
	for _, s := range []string{
		fixture + "&type=tcp", fixture + "&allowInsecure=1", strings.Replace(fixture, "type=tcp", "type=xhttp", 1), strings.Replace(fixture, "security=reality", "security=none", 1), strings.Replace(fixture, "00000000-0000-4000-8000-000000000001", "password", 1), strings.Replace(fixture, ":14443", ":0", 1), strings.Replace(fixture, "sid=0123456789abcdef", "sid=0", 1), strings.Replace(fixture, "fp=chrome", "fp=unknown", 1), strings.Replace(fixture, "pbk=AAAA", "pbk=%0AAAAA", 1), fixture + "&spx=%0A", fixture + "&x=%ZZ",
	} {
		if _, e := Parse([]byte(s)); e == nil {
			t.Fatal("accepted malformed URI")
		}
	}
}
func TestRejectJSON(t *testing.T) {
	c, _ := Parse([]byte(fixture))
	b, _ := json.Marshal(c)
	for _, s := range []string{
		strings.Replace(string(b), `"127.0.0.1"`, `"0.0.0.0"`, 1), strings.Replace(string(b), `"inbounds":`, `"routing":{},"inbounds":`, 1), strings.Replace(string(b), `"log":`, `"log":{},"log":`, 1), string(b) + "{}", strings.Replace(string(b), `"protocol":"vless"`, `"protocol":"freedom"`, 1), strings.Replace(string(b), `"auth":"noauth"`, `"auth":"noauth","udp":true`, 1),
		strings.Replace(string(b), `"protocol":"vless"`, `"protocol":"freedom","Protocol":"vless"`, 1),
		strings.Replace(string(b), `"protocol":"vless"`, `"Protocol":"vless"`, 1),
	} {
		if _, e := Parse([]byte(s)); e == nil {
			t.Fatal("accepted unsafe JSON")
		}
	}
}
func TestBoundedRead(t *testing.T) {
	if _, e := Read(strings.NewReader(strings.Repeat("a", MaxSize+1))); e == nil {
		t.Fatal("oversize accepted")
	}
	if _, e := Read(strings.NewReader("")); e == nil {
		t.Fatal("empty accepted")
	}
}
func FuzzParse(f *testing.F) {
	f.Add([]byte(fixture))
	f.Add([]byte(`{"inbounds":[]}`))
	f.Fuzz(func(t *testing.T, b []byte) {
		c, e := Parse(b)
		if e == nil {
			if len(c.Inbounds) != 2 || c.Inbounds[0].Listen != "127.0.0.1" || len(c.Outbounds) != 1 {
				t.Fatal("unsafe accepted")
			}
		}
	})
}
