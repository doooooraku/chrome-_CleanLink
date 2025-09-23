import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx, defineManifest } from '@crxjs/vite-plugin';

const manifest = defineManifest({
  manifest_version: 3,
  name: 'CleanLink Mini',
  description: 'Clean URLs, remove trackers, expand short links, and export CSV locally.',
  version: '0.1.0',
  default_locale: 'en',
  minimum_chrome_version: '116',
  action: {
    default_popup: 'src/ui/popup/index.html',
    default_icon: {
      '16': 'assets/icons/16.png',
      '32': 'assets/icons/32.png',
      '48': 'assets/icons/48.png'
    }
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module'
  },
  options_page: 'src/ui/options/index.html',
  icons: {
    '16': 'assets/icons/16.png',
    '32': 'assets/icons/32.png',
    '48': 'assets/icons/48.png',
    '128': 'assets/icons/128.png'
  },
  permissions: ['storage', 'activeTab', 'scripting', 'downloads', 'clipboardWrite'],
  host_permissions: [],
  optional_permissions: ['http://*/*', 'https://*/*'],
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/main.ts'],
      run_at: 'document_idle'
    }
  ],
  web_accessible_resources: [
    {
      resources: ['src/ui/history/index.html'],
      matches: ['<all_urls>']
    }
  ],
  commands: {
    'clean-current-tab': {
      suggested_key: {
        default: 'Alt+Shift+C'
      },
      description: 'Clean the current tab URL'
    }
  }
});

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: 'src/ui/popup/index.html',
        options: 'src/ui/options/index.html',
        history: 'src/ui/history/index.html'
      }
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['tests/unit/setup.ts']
  }
});
