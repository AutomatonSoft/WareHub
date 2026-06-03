import { redirect } from "next/navigation";

export default function HoodPage() {
  redirect("/channels?tab=hood");
}
