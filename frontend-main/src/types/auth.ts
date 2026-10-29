export interface User {
  id: number;
  email: string;
  name: string;
  avatar_url: string;
  role: "owner" | "coach" | "student";
  is_superuser?: boolean;
  /** The creator's language (a locale code). */
  preferred_locale?: string;
  date_joined: string;
}
