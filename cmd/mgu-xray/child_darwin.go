package main

import "syscall"

// macOS lacks Linux Pdeathsig; forced-parent-death containment is a release gate.
func childAttributes() *syscall.SysProcAttr { return &syscall.SysProcAttr{Setpgid: true} }
