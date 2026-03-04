import Sidebar from "@/components/sidebar";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex h-screen overflow-hidden">
            <Sidebar />
            <main className="flex-1 overflow-y-auto bg-gray-950">
                <div className="p-6 lg:p-8 max-w-7xl mx-auto">{children}</div>
            </main>
        </div>
    );
}
