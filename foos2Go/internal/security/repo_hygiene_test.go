package security

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRepoHasNoLocalArtifacts(t *testing.T) {
	wd, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	// When running `go test`, the working directory is the package dir
	// (e.g. meituanGo/internal/security). Walk up to meituanGo/.
	root := wd
	for i := 0; i < 2; i++ {
		// security -> internal -> meituanGo
		idx := strings.LastIndexAny(root, string(os.PathSeparator))
		if idx <= 0 {
			break
		}
		root = root[:idx]
	}

	forbidden := []string{
		"main.exe",
		"server.exe",
		"server",
		"meituan-server",
		"data/meituan.db",
		"opt/meituanGo/data/meituan.db",
	}
	for _, rel := range forbidden {
		p := filepath.Join(root, filepath.FromSlash(rel))
		if _, err := os.Stat(p); err == nil {
			t.Fatalf("forbidden artifact exists: %s", rel)
		}
	}
}
