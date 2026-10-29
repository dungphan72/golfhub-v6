import "server-only";

import { z } from "zod";
import { getSupabaseEnvironment } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const courseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  city: z.string(),
  province: z.string(),
  address: z.string(),
  description: z.string(),
  amenities: z.array(z.string()),
});

const teeTimeSchema = z.object({
  id: z.string().uuid(),
  starts_at: z.string().datetime({ offset: true }),
  ends_at: z.string().datetime({ offset: true }),
  price_per_player_minor: z.union([
    z.number(),
    z.string().regex(/^\d+$/),
  ]).transform(Number).pipe(z.number().int().nonnegative().safe()),
  currency: z.literal("VND"),
  capacity: z.number().int().positive(),
  available_seats: z.number().int().nonnegative(),
});

export type Course = z.infer<typeof courseSchema>;
export type TeeTime = z.infer<typeof teeTimeSchema>;

export type CourseDirectoryResult =
  | { status: "unconfigured" }
  | { status: "error" }
  | { status: "ok"; courses: Course[]; page: number; hasNextPage: boolean };

export async function getCourseDirectory({
  query,
  city,
  page,
}: {
  query: string;
  city: string;
  page: number;
}): Promise<CourseDirectoryResult> {
  if (!getSupabaseEnvironment().configured) {
    return { status: "unconfigured" };
  }

  const pageSize = 12;
  const safeQuery = query.trim().slice(0, 80).replace(/[\\%_]/g, "\\$&");
  const safeCity = city.trim().slice(0, 80).replace(/[\\%_]/g, "\\$&");
  const currentPage = Number.isInteger(page) ? Math.min(Math.max(page, 1), 1000) : 1;
  const supabase = await createSupabaseServerClient();
  let request = supabase
    .from("golf_courses")
    .select("id, name, slug, city, province, address, description, amenities")
    .eq("verification_status", "verified")
    .eq("is_published", true)
    .order("name")
    .range((currentPage - 1) * pageSize, currentPage * pageSize);

  if (safeQuery) {
    request = request.ilike("name", `%${safeQuery}%`);
  }
  if (safeCity) {
    request = request.ilike("city", `%${safeCity}%`);
  }

  const { data, error } = await request;
  if (error) {
    console.error("Could not load verified courses", { code: error.code });
    return { status: "error" };
  }

  const parsed = z.array(courseSchema).safeParse(data);
  if (!parsed.success) {
    console.error("Course query returned data with an invalid shape");
    return { status: "error" };
  }

  return {
    status: "ok",
    courses: parsed.data.slice(0, pageSize),
    page: currentPage,
    hasNextPage: parsed.data.length > pageSize,
  };
}

export type CourseDetailResult =
  | { status: "unconfigured" }
  | { status: "error" }
  | { status: "not_found" }
  | { status: "ok"; course: Course; teeTimes: TeeTime[] };

export async function getCourseBySlug(slug: string): Promise<CourseDetailResult> {
  if (!getSupabaseEnvironment().configured) {
    return { status: "unconfigured" };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("golf_courses")
    .select("id, name, slug, city, province, address, description, amenities")
    .eq("slug", slug)
    .eq("verification_status", "verified")
    .eq("is_published", true)
    .maybeSingle();

  if (error) {
    console.error("Could not load course details", { code: error.code });
    return { status: "error" };
  }
  if (!data) {
    return { status: "not_found" };
  }

  const parsedCourse = courseSchema.safeParse(data);
  if (!parsedCourse.success) {
    console.error("Course detail query returned data with an invalid shape");
    return { status: "error" };
  }

  const { data: teeTimeData, error: teeTimeError } = await supabase.rpc(
    "list_course_availability",
    { requested_course_id: parsedCourse.data.id },
  );

  if (teeTimeError) {
    console.error("Could not load course availability", { code: teeTimeError.code });
    return { status: "error" };
  }

  const parsedTeeTimes = z.array(teeTimeSchema).safeParse(teeTimeData);
  if (!parsedTeeTimes.success) {
    console.error("Tee-time query returned data with an invalid shape");
    return { status: "error" };
  }

  return {
    status: "ok",
    course: parsedCourse.data,
    teeTimes: parsedTeeTimes.data.filter((teeTime) => teeTime.available_seats > 0),
  };
}
