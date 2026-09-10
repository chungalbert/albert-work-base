import type { Role } from "./types";

export function roleLabel(isAdmin: boolean, role: Role | null): string {
  if (isAdmin) return "管理員";
  if (role === "leader") return "專案領導";
  if (role === "member") return "專案成員";
  return "未加入此專案";
}
