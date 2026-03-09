import { useEffect } from 'preact/hooks';

export default function AdminEntryIsland() {
  useEffect(() => {
    // Dynamically import the entry script
    import('../../scripts/admin/admin-entry.ts')
      .then((module) => {
        // Ensure globals are bound if the module exports a setup function
        if (module.bindAdminGlobals) {
            module.bindAdminGlobals();
        }
        // Re-run init if needed
        if (module.initAdminPage) {
             module.initAdminPage();
        }
      })
      .catch((e) => {
      console.error('[AdminEntryIsland] failed to load admin entry', e);
    });
  }, []);

  return null;
}
