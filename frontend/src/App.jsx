import { useState, useEffect } from "react";
import Auth from "./components/Auth.jsx";
import Dashboard from "./components/Dashboard.jsx";

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem("ht_token"));

  useEffect(() => {
    if (token) {
      localStorage.setItem("ht_token", token);
    } else {
      localStorage.removeItem("ht_token");
    }
  }, [token]);

  const handleLogout = () => {
    setToken(null);
  };

  if (!token) {
    return <Auth onAuth={setToken} />;
  }

  return <Dashboard token={token} onLogout={handleLogout} />;
}
