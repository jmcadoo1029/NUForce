import { useState } from "react";
import Login from "./Login";
import App from "./App";

export default function Root() {
  const [user, setUser] = useState(() => sessionStorage.getItem("vibrato_user") || null);

  const handleLogin = (email) => {
    sessionStorage.setItem("vibrato_user", email);
    setUser(email);
  };

  const handleLogout = () => {
    sessionStorage.removeItem("vibrato_user");
    setUser(null);
  };

  if (!user) return <Login onLogin={handleLogin} />;
  return <App onLogout={handleLogout} currentUser={user} />;
}
