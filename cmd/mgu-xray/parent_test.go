package main

import (
	"context"
	"sync/atomic"
	"testing"
	"time"
)

func TestParentLossCancelsSupervisor(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	var pid atomic.Int64
	pid.Store(123)
	go watchParent(ctx, cancel, 123, time.Millisecond, func() int { return int(pid.Load()) })
	select {
	case <-ctx.Done():
		t.Fatal("cancelled while owner remained alive")
	case <-time.After(10 * time.Millisecond):
	}
	pid.Store(1)
	select {
	case <-ctx.Done():
	case <-time.After(time.Second):
		t.Fatal("did not cancel after UI owner vanished")
	}
}
