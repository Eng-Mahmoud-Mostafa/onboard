import Image from "next/image";
import clsx from "clsx";

export function OnboardLogo({ className }: { className?: string }) {
  return (
    <div className={clsx("relative h-12 w-44", className)}>
      <Image
        src="/onboard-logo.png"
        alt="Onboard Travel & Tourism"
        fill
        priority
        className="object-contain"
        sizes="176px"
      />
    </div>
  );
}
