import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";
const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });
// Images webp déjà légères (180 px) : <img> simple, pas besoin de next/image.
export default [...compat.extends("next/core-web-vitals", "next/typescript"), { rules: { "@next/next/no-img-element": "off" } }];
