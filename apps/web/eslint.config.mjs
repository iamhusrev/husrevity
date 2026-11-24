import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import { createRequire } from "module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Bun installs packages in isolated folders, so the plugins that
// eslint-config-next depends on are not resolvable from this directory.
// Resolve them relative to eslint-config-next itself.
const require = createRequire(import.meta.url);

const compat = new FlatCompat({
  baseDirectory: __dirname,
  resolvePluginsRelativeTo: dirname(require.resolve("eslint-config-next/package.json")),
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),

  // Add custom rules here
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "react/no-children-prop": "off",
    },
  },
];

export default eslintConfig;
