import { Navigate, useLocation } from "react-router-dom";

export function Component() {
  const { pathname, search, hash } = useLocation();
  return <Navigate replace to={{ pathname: pathname.replace(/^\/wiki(?=\/|$)/, "/explorer"), search, hash }} />;
}
