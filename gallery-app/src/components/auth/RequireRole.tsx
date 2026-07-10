import { Navigate } from 'react-router-dom';
import { usePermissions } from '../../hooks/usePermissions';
import type { Role } from '../../hooks/usePermissions';

interface RequireRoleProps {
  roles: Role[];
  children: React.ReactNode;
  fallbackPath?: string;
}

export function RequireRole({ roles, children, fallbackPath = '/dashboard' }: RequireRoleProps) {
  const { isSuperAdmin, isShopOwner, loading, isBuyer } = usePermissions();

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
        <div style={{ width: '40px', height: '40px', border: '3px solid #E8E0D8', borderTopColor: 'var(--primary-color)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      </div>
    );
  }

  const hasAccess = roles.some(role => {
    switch (role) {
      case 'super_admin': return isSuperAdmin;
      case 'shop_owner': return isShopOwner();
      case 'buyer': return isBuyer;
      default: return false;
    }
  });

  if (!hasAccess) {
    return <Navigate to={fallbackPath} replace />;
  }

  return <>{children}</>;
}