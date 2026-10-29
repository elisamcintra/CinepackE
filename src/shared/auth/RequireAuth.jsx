import { Navigate, useLocation } from 'react-router';
import { useAuth } from './AuthProvider.jsx';
import Spinner from '../ui/Spinner.jsx';

// Protege uma página: sem login, manda para a tela de login do módulo
export default function RequireAuth({ children, loginPath }) {
  const { carregando, user } = useAuth();
  const location = useLocation();

  if (carregando) {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <Spinner />
      </div>
    );
  }
  if (!user) return <Navigate to={loginPath} replace state={{ de: location.pathname + location.search }} />;
  return children;
}
