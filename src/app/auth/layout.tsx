import { NauticAdminLogo } from "@/components/icons/NauticAdminLogo";
import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="landing-water flex min-h-screen min-h-[100dvh] w-full flex-col items-center justify-center overflow-x-hidden px-4 py-10 sm:px-6">
      <Link href="/" className="mb-8 flex items-center gap-3">
        <NauticAdminLogo className="h-10 w-10" />
        <span className="font-headline text-2xl font-semibold tracking-[-0.02em] text-foreground sm:text-3xl">
          NauticAdmin
        </span>
      </Link>
      <div className="flex w-full min-w-0 max-w-full flex-col items-center">
        {children}
      </div>
    </div>
  );
}
