import type { ComponentPropsWithoutRef } from "react";
import searchoMarkSrc from "@/assets/searcho-mark.svg";

export const SearchoMark = ({ className, ...props }: ComponentPropsWithoutRef<"img">) => {
  return (
    <img
      src={searchoMarkSrc}
      alt=""
      aria-hidden="true"
      className={["object-contain", className].filter(Boolean).join(" ")}
      draggable={false}
      {...props}
    />
  );
};

export default SearchoMark;
