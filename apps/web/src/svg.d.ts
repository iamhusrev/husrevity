// svg.d.ts
declare module "*.svg" {
  import * as React from "react";
  const Svg: React.FunctionComponent<React.SVGProps<SVGSVGElement> & { title?: string }>;
  export default Svg;
}
