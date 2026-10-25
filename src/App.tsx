import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import LoginScreen from "./auth/LoginScreen";
import RegisterScreen from "./auth/RegisterScreen";
import Home from "./pages/Home";
import Wall from "./pages/Wall";
import CreateClimb from "./pages/CreateClimb";
import ClimbsList from "./pages/ClimbsList";
import ClimbDetail from "./pages/ClimbDetail";
import Profile from "./pages/Profile";

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="splash">Loading...</div>;
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginScreen />} />
        <Route path="/register" element={<RegisterScreen />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/home" element={<Home />} />
      <Route path="/wall" element={<Wall />} />
      <Route path="/climbs" element={<ClimbsList />} />
      <Route path="/climbs/new" element={<CreateClimb />} />
      <Route path="/climbs/:id" element={<ClimbDetail />} />
      <Route path="/climbs/:id/edit" element={<CreateClimb />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  );
}
