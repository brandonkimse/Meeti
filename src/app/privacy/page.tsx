import Link from "next/link";
import { Contact, LegalPage } from "@/components/LegalPage";
import { config } from "@/server/config";

export const metadata = { title: "Privacy policy · Meeti" };

export default function Privacy() {
  const { operator, email } = config.legal;
  return (
    <LegalPage title="Privacy policy" updated="18 November 2026">
      <p>
        Meeti helps friends pick a fair place to meet. To do that it needs some personal information, including where you&apos;re starting from and, only if you turn it on,
        your live location. This policy explains what we collect, why, who it goes to, how long we keep it, and how to delete it.
      </p>

      <h2>1. Who&apos;s responsible</h2>
      <p>
        Meeti is run by <Contact operator={operator} email={email} />. This contact is also our privacy officer (개인정보 보호책임자) for questions, requests and complaints.
      </p>

      <h2>2. What we collect and why</h2>
      <table>
        <thead>
          <tr>
            <th>Information</th>
            <th>Why</th>
            <th>How long we keep it</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Account: name, email, password, optional profile photo</td>
            <td>To create your account, sign you in, and show friends who you are. Passwords are stored only as a secure hash by our login provider.</td>
            <td>Until you delete your account</td>
          </tr>
          <tr>
            <td>Guest name, and a random code saved in your browser</td>
            <td>To let you join a plan from a link without an account</td>
            <td>Until you&apos;re no longer in any plan (we remove guest details within a day after that), or until you ask us to delete them</td>
          </tr>
          <tr>
            <td>Groups, plans, votes and places you add</td>
            <td>To run the plans you take part in</td>
            <td>Until the plan&apos;s host deletes it, or you delete your account</td>
          </tr>
          <tr>
            <td>Starting point for a plan (typed address or GPS)</td>
            <td>To work out everyone&apos;s travel time and recommend a fair spot. Only people in that plan can see it.</td>
            <td>Deleted when the hangout ends, or a day after its planned time if a spot was never chosen. You can change or clear it while the plan is being made.</td>
          </tr>
          <tr>
            <td>Live location, only if you turn it on for a hangout: position, accuracy and arrival estimate</td>
            <td>To show the people in that hangout that you&apos;re on your way</td>
            <td>Your coordinates are deleted as soon as you stop sharing, when sharing expires, or when the hangout ends. We keep only the time you arrived, for the recap.</td>
          </tr>
          <tr>
            <td>IP address and basic request details</td>
            <td>To keep the service secure and stop abuse, for example by limiting how fast one person can make requests</td>
            <td>Abuse-prevention counters: up to 24 hours. Hosting logs: as kept by our host, typically a few days.</td>
          </tr>
          <tr>
            <td>Anonymous page-view statistics</td>
            <td>To understand which pages are used. This uses no cookies and no advertising IDs.</td>
            <td>Aggregated only</td>
          </tr>
        </tbody>
      </table>
      <p>We don&apos;t sell personal information or use it for advertising.</p>

      <h2>3. Location information</h2>
      <ul>
        <li>Live location is always off until you turn it on for one specific hangout. You can pause or stop it at any time, and it switches itself off when the hangout ends.</li>
        <li>You never have to use GPS: you can type an address or a nearby landmark instead.</li>
        <li>Your starting point and live position are visible only to the people in that plan, which includes anyone who joins with the plan&apos;s link.</li>
      </ul>

      <h2>4. Services that process data for us</h2>
      <p>
        We use the providers below to run Meeti. Some are outside Korea, so your information may be transferred abroad (국외 이전) when you use the service, over encrypted
        connections. To calculate routes and find places, we send map services coordinates and place names only, never your name or email. Each provider&apos;s
        privacy policy (linked below) explains how long it keeps data and how to contact it.
      </p>
      <table>
        <thead>
          <tr>
            <th>Provider</th>
            <th>Country</th>
            <th>What it does</th>
            <th>What it receives</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><a href="https://supabase.com/privacy">Supabase</a></td>
            <td>Data stored in Seoul, Korea (company in the USA)</td>
            <td>Database, sign-in, and live updates</td>
            <td>Everything in section 2 that Meeti stores</td>
          </tr>
          <tr>
            <td><a href="https://vercel.com/legal/privacy-policy">Vercel</a></td>
            <td>Servers run in Seoul, Korea (company in the USA)</td>
            <td>Hosting, logs and anonymous page-view statistics</td>
            <td>Requests to Meeti, including IP address</td>
          </tr>
          <tr>
            <td>Our email provider</td>
            <td>USA</td>
            <td>Sending sign-up and password-reset emails</td>
            <td>Your email address and the email&apos;s contents</td>
          </tr>
          <tr>
            <td>
              OpenStreetMap services: OSRM (<a href="https://www.fossgis.de/datenschutzerkl%C3%A4rung">FOSSGIS e.V.</a>), Photon (<a href="https://www.komoot.com/privacy">komoot</a>),
              Nominatim (<a href="https://osmfoundation.org/wiki/Privacy_Policy">OpenStreetMap Foundation</a>)
            </td>
            <td>Germany, UK</td>
            <td>Travel times, place search and address lookup</td>
            <td>Coordinates and search text, sent from our servers</td>
          </tr>
          <tr>
            <td><a href="https://www.maptiler.com/privacy-policy/">MapTiler</a></td>
            <td>Switzerland</td>
            <td>Map images loaded by your browser for the area you&apos;re viewing</td>
            <td>Your IP address and the map area you&apos;re viewing</td>
          </tr>
          <tr>
            <td><a href="https://policies.google.com/privacy">Google Maps Platform</a>, if enabled</td>
            <td>USA</td>
            <td>Transit times, place details and photos</td>
            <td>Coordinates and search text, sent from our servers</td>
          </tr>
        </tbody>
      </table>
      <p>If you don&apos;t want your information transferred abroad, you can stop using Meeti and delete your account, but the service can&apos;t work without these providers.</p>

      <h2>5. Cookies</h2>
      <p>
        Meeti uses only the cookies it needs to work: a sign-in cookie when you have an account, and a guest cookie when you join a plan by link. There are no advertising or
        tracking cookies.
      </p>

      <h2>6. Your rights</h2>
      <ul>
        <li>
          <strong>See and correct:</strong> your name and photo are on your <Link href="/profile">profile</Link>. Your starting point can be changed in each plan.
        </li>
        <li>
          <strong>Delete:</strong> you can delete your account and personal information at any time from your <Link href="/profile">profile</Link>. Guests can ask us by email.
        </li>
        <li>
          <strong>Withdraw consent:</strong> stop live sharing at any time, or delete your account.
        </li>
        <li>
          <strong>Ask or complain:</strong> contact us using the details above. You can also contact Korea&apos;s Personal Information Protection Commission (privacy.go.kr, call 182) or
          the KISA privacy report center (privacy.kisa.or.kr, call 118).
        </li>
      </ul>

      <h2>7. Deleting information</h2>
      <p>
        When information is no longer needed, or you delete your account, we delete it from our database without delay. Deleted data may remain in encrypted backups for a short
        time until they expire.
      </p>

      <h2>8. Security</h2>
      <p>All connections use encryption (HTTPS), passwords are hashed, and access to the database is restricted to the Meeti servers.</p>

      <h2>9. Age</h2>
      <p>Meeti is for people aged 14 and over.</p>

      <h2>10. Changes</h2>
      <p>If we change this policy, we&apos;ll update the date above, and tell you in the app if the change is significant.</p>
    </LegalPage>
  );
}
