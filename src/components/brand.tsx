import Link from "next/link";

// A chalkboard mark: a framed board with a chalk stroke.
export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link className="brand" href={href} aria-label="MyPisara home">
      <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
        <rect x="3" y="5" width="26" height="19" rx="4" />
        <path d="M9 17c3-5 6-5 8-2s5 2 7-3" />
        <path d="M10 28h12" />
      </svg>
      <span>
        My<b>Pisara</b>
      </span>
    </Link>
  );
}
