import { defineConfig } from 'vitest/config';

// `base` must match the GitHub repository name so assets resolve on GitHub Pages:
// https://<user>.github.io/community_wifi_planner/
export default defineConfig({
  base: '/community_wifi_planner_2/',
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
