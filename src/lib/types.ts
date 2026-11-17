// Types shared by the server and the client.

export type Mode = "walking" | "transit" | "cycling" | "driving";
export type Category = "food" | "cafe" | "activity" | "shopping" | "park" | "drinks";
export type HangoutStatus = "planning" | "live" | "completed" | "cancelled";
export type ShareStatus = "active" | "paused" | "stopped" | "expired";
export type TravelSource = "osrm" | "google" | "model";

export type LatLng = { lat: number; lng: number };

export type PublicUser = {
  id: string;
  name: string;
  avatarUrl: string | null;
  online: boolean;
  isDemo: boolean;
  isGuest: boolean;
};

export type MemberTravel = {
  userId: string;
  mode: Mode;
  seconds: number | null;
  meters: number | null;
  source: TravelSource;
};

export type TravelSummary = {
  perMember: MemberTravel[];
  avg: number | null;
  max: number | null;
  min: number | null;
  /** Jain's fairness index over travel times: 1 = everyone travels equally long. */
  fairness: number | null;
  /** How many participants with a starting point were included. */
  counted: number;
};

export type PlaceCandidate = {
  externalId: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  category: Category | null;
  kind: string | null;
  imageUrl: string | null;
  rating: number | null;
  ratingCount: number | null;
};

export type Recommendation = PlaceCandidate & {
  travel: TravelSummary;
  score: number;
  reason: string;
  /** 0–1, from review counts (Google) or how lively the surroundings are (OpenStreetMap). */
  popularity?: number;
  /** The best-loved spot that's still a fair trip for everyone. */
  popular?: boolean;
};

export type RecommendationSet = {
  category: Category;
  key: string;
  generatedAt: number;
  center: LatLng | null;
  areas: LatLng[];
  items: Recommendation[];
  notes: string[];
};

export type GroupSummary = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  emoji: string | null;
  role: "owner" | "member";
  memberCount: number;
  members: PublicUser[];
  nextHangout: { id: string; title: string; startsAt: number; status: HangoutStatus } | null;
};

export type GroupDetail = GroupSummary & {
  inviteCode: string;
  ownerId: string;
  createdAt: number;
  hangouts: HangoutListItem[];
};

export type HangoutListItem = {
  id: string;
  title: string;
  startsAt: number;
  endsAt: number;
  status: HangoutStatus;
  mode: Mode;
  destName: string | null;
  destImageUrl: string | null;
  category: Category | null;
  participantCount: number;
  groupId: string | null;
  groupName?: string;
  /** Host (or group owner): may delete it. */
  canManage: boolean;
  /** Over or past its time: may be archived. */
  canArchive: boolean;
  /** Archived by the person viewing the list. */
  archived: boolean;
};

export type Participant = {
  user: PublicUser;
  rsvp: "going" | "maybe" | "declined";
  mode: Mode;
  origin: (LatLng & { label: string | null; source: "gps" | "manual" | null }) | null;
};

export type Suggestion = {
  id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  category: Category | null;
  imageUrl: string | null;
  rating: number | null;
  ratingCount: number | null;
  source: "member" | "meeti";
  addedBy: string | null;
  travel: TravelSummary | null;
  travelStale: boolean;
  votes: string[];
};

export type LiveShare = {
  userId: string;
  status: ShareStatus;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  updatedAt: number | null;
  etaSeconds: number | null;
  distanceMeters: number | null;
  etaSource: TravelSource | null;
  arrivedAt: number | null;
  startedMovingAt: number | null;
  expiresAt: number;
};

export type TravelState = "not_started" | "on_the_way" | "arrived" | "not_sharing" | "paused";

export type HangoutDetail = {
  id: string;
  title: string;
  startsAt: number;
  endsAt: number;
  status: HangoutStatus;
  mode: Mode;
  category: Category | null;
  createdBy: string;
  canManage: boolean;
  canArchive: boolean;
  archived: boolean;
  pollClosesAt: number | null;
  finalizedAt: number | null;
  completedAt: number | null;
  group: { id: string; name: string; emoji: string | null; imageUrl: string | null } | null;
  shareCode: string;
  destination: (LatLng & { name: string; address: string | null; imageUrl: string | null; suggestionId: string | null }) | null;
  participants: Participant[];
  suggestions: Suggestion[];
  recommendations: RecommendationSet | null;
  recommendationsStale: boolean;
  shares: LiveShare[];
  me: { id: string; share: LiveShare | null; isGuest: boolean };
  providers: { transit: "google" | "estimate"; places: "google" | "openstreetmap"; demoMode: boolean };
};

export const MODES: { id: Mode; label: string; emoji: string }[] = [
  { id: "walking", label: "Walk", emoji: "🚶" },
  { id: "transit", label: "Transit", emoji: "🚇" },
  { id: "cycling", label: "Bike", emoji: "🚲" },
  { id: "driving", label: "Drive", emoji: "🚗" },
];

export const CATEGORIES: { id: Category; label: string; emoji: string }[] = [
  { id: "food", label: "Food", emoji: "🍜" },
  { id: "cafe", label: "Cafés", emoji: "☕" },
  { id: "activity", label: "Activities", emoji: "🎳" },
  { id: "drinks", label: "Drinks", emoji: "🍹" },
  { id: "shopping", label: "Shopping", emoji: "🛍️" },
  { id: "park", label: "Parks", emoji: "🌳" },
];
