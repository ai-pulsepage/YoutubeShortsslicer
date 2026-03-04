import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Sidebar from "@/components/sidebar";

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await auth();

    if (!session) {
        redirect("/login");
    }

    return (
        <div className="flex h-screen overflow-hidden">
            <Sidebar />
            <main className="flex-1 overflow-y-auto bg-gray-950">
                <div className="p-6 lg:p-8 max-w-7xl mx-auto">{children}</div>
            </main>
        </div>
    );
}
