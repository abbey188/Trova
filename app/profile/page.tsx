import { ProfileView } from "@/components/trova/profile-view";
import { Shell } from "@/components/trova/shell";

export default function ProfilePage() {
  return (
    <Shell title="Profile" active="profile">
      <ProfileView />
    </Shell>
  );
}
