import RoleRoute from "@/components/RoleRoute";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  return <RoleRoute require="user">{children}</RoleRoute>;
}
