import Link from "next/link";
import { Contact, LegalPage } from "@/components/LegalPage";
import { config } from "@/server/config";

export const metadata = { title: "Terms of service · Meeti" };

export default function Terms() {
  const { operator, email } = config.legal;
  return (
    <LegalPage title="Terms of service" updated="18 November 2026">
      <p>
        These terms apply when you use Meeti, with an account or as a guest. By using Meeti you agree to them and to our <Link href="/privacy">privacy policy</Link>.
      </p>

      <h2>1. Using Meeti</h2>
      <ul>
        <li>You must be 14 or older.</li>
        <li>Keep your login details safe. You&apos;re responsible for what happens on your account.</li>
        <li>Use your real first name or a name your friends will recognise, and only invite people who&apos;d want to be invited.</li>
      </ul>

      <h2>2. Location features</h2>
      <ul>
        <li>Meeti uses the starting points you enter to suggest fair meeting places. Live location sharing is optional and only runs when you turn it on for a hangout.</li>
        <li>Only share your own location. Don&apos;t use Meeti to track anyone without their knowledge.</li>
      </ul>

      <h2>3. What you can&apos;t do</h2>
      <ul>
        <li>Harass, threaten or impersonate anyone, or post illegal or offensive content.</li>
        <li>Send spam, create plans or accounts in bulk, or use bots or scripts against the service.</li>
        <li>Try to get around security or usage limits, or access data that isn&apos;t yours.</li>
      </ul>
      <p>We may suspend or remove accounts and content that break these rules.</p>

      <h2>4. Your content</h2>
      <p>
        You own what you add to Meeti, such as plan names, places and photos. You allow us to store it and show it to the people in your groups and plans so the service works.
      </p>

      <h2>5. Recommendations and other sites</h2>
      <ul>
        <li>Travel times and recommendations are estimates based on map data. Check opening hours and routes before you go.</li>
        <li>Places are run by third parties, not by Meeti. Links to other sites are provided for convenience, and some may earn us a commission. We mark those links.</li>
      </ul>

      <h2>6. The service</h2>
      <p>
        Meeti is provided as it is and may change, and we can&apos;t promise it will always be available or error-free. To the extent the law allows, we&apos;re not liable for
        indirect losses from using it. Nothing here limits rights you have under Korean consumer law.
      </p>

      <h2>7. Ending your use</h2>
      <p>
        You can stop using Meeti and delete your account at any time from your <Link href="/profile">profile</Link>.
      </p>

      <h2>8. Changes and law</h2>
      <p>
        If we change these terms, we&apos;ll update the date above and tell you in the app if the change is significant. These terms are governed by the laws of the Republic of Korea.
      </p>

      <h2>9. Contact</h2>
      <p>
        <Contact operator={operator} email={email} />
      </p>
    </LegalPage>
  );
}
