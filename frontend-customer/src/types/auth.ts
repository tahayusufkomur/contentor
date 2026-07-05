export interface User {
  id: number;
  email: string;
  name: string;
  avatar_url: string;
  role: "owner" | "coach" | "student";
  date_joined: string;
}
