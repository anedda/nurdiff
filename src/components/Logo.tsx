import { useId } from "react";

/** The NurDiff logo (a nuraghe) in a simplified version for small sizes; the original is in `src-tauri/icons`. */
export default function Logo({ size = 18, ...rest }: { size?: number } & React.SVGProps<SVGSVGElement>) {
  // An identifier per instance: the logo appears several times on the same page (title bar and Home).
  const bg = `logo-bg-${useId().replace(/:/g, "")}`;
  return (
    <svg viewBox="0 0 1024 1024" width={size} height={size} aria-hidden {...rest}>
      <defs>
        <linearGradient id={bg} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="1024">
          <stop offset="0" stopColor="#4da6f0" />
          <stop offset="1" stopColor="#226cd1" />
        </linearGradient>
      </defs>
      <rect width="1024" height="1024" rx="190" fill={`url(#${bg})`} />
      <path d="M345 245L680 245L712 352L313 352Z M299 396L726 396L758 503L267 503Z M253 547L772 547L804 654L221 654Z M207 698L818 698L850 805L175 805Z" fill="#fff" />
      <path d="M544 244L588 244L588 353L544 353Z M422 395L466 395L466 504L422 504Z M573 546L617 546L617 655L573 655Z M436 685L588 685L607 807L417 807Z" fill={`url(#${bg})`} />
    </svg>
  );
}
