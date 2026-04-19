import { getAuthUser } from "@/lib/auth/user";
import { AppHeader } from "@/components/app-header";

export default async function ProjectsLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthUser();
  return (
    <div className="min-h-screen">
      <AppHeader email={user?.email} />
      <div className="mx-auto w-full max-w-5xl px-4 py-8">{children}</div>
    </div>
  );
}
