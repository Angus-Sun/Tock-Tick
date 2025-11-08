import { Navigate } from 'react-router-dom';
import { useUser } from '../hooks/useUser.jsx';

export default function ProtectedRoute({ children }) {
	const { user } = useUser();
	if (user === undefined) {
		// Shouldn't happen normally; context initializes to null.
		return null;
	}
	if (!user) return <Navigate to="/login" replace />;
	return children;
}
