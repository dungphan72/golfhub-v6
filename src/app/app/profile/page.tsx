import { ProfileForm } from "@/components/profile-form";
import { updateProfileAction } from "@/app/app/profile/actions";
import { requireCurrentUser } from "@/lib/auth";

export const instant = false;

type ProfilePageProps = {
  searchParams: Promise<{ saved?: string }>;
};

export default async function ProfilePage({ searchParams }: ProfilePageProps) {
  const [{ supabase, user }, params] = await Promise.all([
    requireCurrentUser(),
    searchParams,
  ]);
  const { data, error } = await supabase
    .from("profiles")
    .select("full_name, city")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("Could not load user profile", { code: error.code });
    throw new Error("Không thể tải hồ sơ người dùng.");
  }
  if (!data) {
    throw new Error("Không tìm thấy hồ sơ. Hãy kiểm tra migration tạo hồ sơ.");
  }

  return (
    <section className="dashboard-content">
      <p className="eyebrow">TÀI KHOẢN CỦA BẠN</p>
      <h1>Hồ sơ golfer</h1>
      <p className="subpage-intro">
        Chỉ bạn mới có thể xem và cập nhật thông tin hồ sơ này.
      </p>
      <ProfileForm
        action={updateProfileAction}
        city={data.city ?? ""}
        fullName={data.full_name}
        saved={params.saved === "1"}
      />
    </section>
  );
}
