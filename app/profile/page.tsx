import { AppFrame } from "@/components/trova/frame";
import { ProfileContent } from "@/components/trova/profile";

// The Profile tab on mobile; on desktop the same content opens as a sheet from the avatar.
export default function ProfilePage() {
  return (
    <AppFrame active="profile">
      <ProfileContent />
    </AppFrame>
  );
}
