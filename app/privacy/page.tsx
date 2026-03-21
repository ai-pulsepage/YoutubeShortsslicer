import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Privacy Policy | Vaidya Digital",
    description: "Privacy Policy for Vaidya Digital's Clip Studio platform.",
};

export default function PrivacyPolicy() {
    return (
        <div className="min-h-screen bg-gray-950 text-gray-300">
            <div className="max-w-3xl mx-auto px-6 py-16">
                <h1 className="text-4xl font-bold text-white mb-2">Privacy Policy</h1>
                <p className="text-gray-500 text-sm mb-10">
                    Last updated: March 21, 2026
                </p>

                <div className="space-y-8 text-sm leading-relaxed">
                    <section>
                        <h2 className="text-lg font-semibold text-white mb-3">1. Introduction</h2>
                        <p>
                            Vaidya Digital (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) operates the Clip Studio platform at
                            vaidyadigital.com. This Privacy Policy explains how we collect, use, store,
                            and protect your personal information when you use our Service.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold text-white mb-3">2. Information We Collect</h2>

                        <h3 className="text-sm font-semibold text-gray-200 mt-4 mb-2">Account Information</h3>
                        <p>
                            When you create an account, we collect your name, email address, and profile
                            image through third-party authentication providers (e.g., Google OAuth).
                        </p>

                        <h3 className="text-sm font-semibold text-gray-200 mt-4 mb-2">Social Media Account Data</h3>
                        <p>
                            When you connect social media accounts (TikTok, YouTube, Instagram), we
                            collect and securely store OAuth access tokens and refresh tokens necessary
                            to post content on your behalf. We also collect basic profile information
                            such as your username and account type. We do <strong>not</strong> access
                            your private messages, followers list, or personal data beyond what is
                            required for the publishing functionality.
                        </p>

                        <h3 className="text-sm font-semibold text-gray-200 mt-4 mb-2">Content Data</h3>
                        <p>
                            We process video URLs you provide, generate transcriptions, and create
                            short-form clips. Source videos and generated clips are stored temporarily
                            in secure cloud storage to enable the Service functionality.
                        </p>

                        <h3 className="text-sm font-semibold text-gray-200 mt-4 mb-2">Usage Data</h3>
                        <p>
                            We collect basic usage analytics such as pages visited, features used, and
                            clip generation activity to improve the Service.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold text-white mb-3">3. How We Use Your Information</h2>
                        <ul className="list-disc list-inside space-y-1 text-gray-400">
                            <li>To provide and maintain the Clip Studio service</li>
                            <li>To authenticate you and manage your account</li>
                            <li>To post content to your connected social media accounts at your direction</li>
                            <li>To process and generate video clips from source content</li>
                            <li>To improve and optimize the Service</li>
                            <li>To communicate with you about service updates or changes</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold text-white mb-3">4. Data Sharing</h2>
                        <p className="mb-2">
                            We do <strong>not</strong> sell, rent, or trade your personal information.
                            We may share data only in the following circumstances:
                        </p>
                        <ul className="list-disc list-inside space-y-1 text-gray-400">
                            <li><strong>Social Media Platforms:</strong> When you explicitly choose to publish content through TikTok, YouTube, or Instagram, we transmit your content and metadata to those platforms via their official APIs</li>
                            <li><strong>AI Processing:</strong> Transcripts may be sent to AI service providers (DeepSeek, Google Gemini) for analysis and clip detection. These services process data according to their respective privacy policies</li>
                            <li><strong>Cloud Storage:</strong> Video files are stored on Cloudflare R2 with encrypted access</li>
                            <li><strong>Legal Requirements:</strong> If required by law, regulation, or legal process</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold text-white mb-3">5. Data Security</h2>
                        <p>
                            We implement industry-standard security measures to protect your data,
                            including encrypted database connections, secure OAuth token storage, and
                            HTTPS encryption for all data in transit. However, no method of electronic
                            storage is 100% secure, and we cannot guarantee absolute security.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold text-white mb-3">6. Data Retention</h2>
                        <p>
                            Account data is retained for as long as your account is active. Generated
                            video clips and source materials are stored for the duration of your active
                            projects. You may delete your projects and associated data at any time
                            through the Service interface. Upon account deletion, we will remove your
                            personal data within 30 days.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold text-white mb-3">7. Your Rights</h2>
                        <p className="mb-2">You have the right to:</p>
                        <ul className="list-disc list-inside space-y-1 text-gray-400">
                            <li>Access the personal data we hold about you</li>
                            <li>Request correction of inaccurate data</li>
                            <li>Request deletion of your data and account</li>
                            <li>Disconnect your social media accounts at any time</li>
                            <li>Export your data in a portable format</li>
                            <li>Withdraw consent for data processing</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold text-white mb-3">8. Third-Party Services</h2>
                        <p>
                            Our Service integrates with third-party platforms. Each platform has its own
                            privacy policy that governs how they handle your data:
                        </p>
                        <ul className="list-disc list-inside space-y-1 text-gray-400 mt-2">
                            <li><a href="https://www.tiktok.com/legal/privacy-policy" className="text-violet-400 hover:underline">TikTok Privacy Policy</a></li>
                            <li><a href="https://policies.google.com/privacy" className="text-violet-400 hover:underline">YouTube / Google Privacy Policy</a></li>
                            <li><a href="https://privacycenter.instagram.com/policy" className="text-violet-400 hover:underline">Instagram Privacy Policy</a></li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold text-white mb-3">9. Children&apos;s Privacy</h2>
                        <p>
                            The Service is not intended for use by individuals under the age of 13. We
                            do not knowingly collect personal information from children under 13. If we
                            become aware that we have collected data from a child under 13, we will
                            take steps to delete that information promptly.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold text-white mb-3">10. Changes to This Policy</h2>
                        <p>
                            We may update this Privacy Policy from time to time. We will notify you of
                            any material changes by posting the updated policy on this page with a
                            revised date. Your continued use of the Service after changes are posted
                            constitutes your acceptance of the updated policy.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold text-white mb-3">11. Contact Us</h2>
                        <p>
                            If you have any questions or concerns about this Privacy Policy or our data
                            practices, please contact us at{" "}
                            <a href="mailto:support@vaidyadigital.com" className="text-violet-400 hover:underline">
                                support@vaidyadigital.com
                            </a>.
                        </p>
                    </section>
                </div>

                <div className="mt-12 pt-6 border-t border-gray-800 text-xs text-gray-600">
                    &copy; {new Date().getFullYear()} Vaidya Digital. All rights reserved.
                </div>
            </div>
        </div>
    );
}
