import { NauticAdminLogo } from "@/components/icons/NauticAdminLogo";
import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 sm:p-6 overflow-x-hidden w-full max-w-full min-h-[100dvh]">
       <div className="absolute inset-0 -z-10 h-full w-full bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:14px_24px]"></div>
       <Link href="/" className="mb-8 flex items-center gap-3 text-2xl font-bold shrink-0">
          <NauticAdminLogo className="h-10 w-10 shrink-0" />
          <h1 className="font-headline text-2xl sm:text-3xl truncate max-w-[90vw]">NauticAdmin</h1>
        </Link>
      <div className="w-full max-w-full min-w-0 flex flex-col items-center">
        {children}
      </div>
    </div>
  );
}
