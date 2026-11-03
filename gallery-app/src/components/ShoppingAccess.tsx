import { useEffect, useRef, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { requestShoppingSignIn } from '../lib/shoppingAuth';
export default function ShoppingAccess({ children }: { children: ReactNode }) {
 const { user, loading } = useAuth(); const location = useLocation(); const opened = useRef('');
 useEffect(() => { if (!loading && !user && opened.current !== location.key) { opened.current = location.key; requestShoppingSignIn(location.pathname); } }, [loading, user, location.key, location.pathname]);
 if (loading) return <div role="status" className="p-12 text-center">Loading your account…</div>;
 if (!user) return <section className="p-12 text-center"><h1>Sign in to continue</h1><p>Sign in to access your cart and checkout.</p><button onClick={() => requestShoppingSignIn(location.pathname)}>Sign In</button> <Link to="/gallery">Continue Shopping</Link></section>;
 return <div key={user.id}>{children}</div>;
}
