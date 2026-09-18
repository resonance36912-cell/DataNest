import RoleRoute from "@/components/RoleRoute";

export default function AdminRoute({ children }: { children: React.ReactNode }) {
  return <RoleRoute require="admin">{children}</RoleRoute>;
}
