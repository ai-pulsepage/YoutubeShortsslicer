import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Terms of Service | Vaidya Digital",
    description: "Terms of Service for Vaidya Digital's Clip Studio platform.",
};

export default function TermsOfService() {
    return (
        <div className="min-h-screen bg-gray-950 text-gray-300">
            <div className="max-w-3xl mx-auto px-6 py-16">
                <h1 className="text-4xl font-bold text-white mb-2">Terms of Service</h1>
                <p className="text-gray-500 text-sm mb-10">
                    Last updated: March 21, 2026
                </p>

                <div className="space-y-8 text-sm leading-relaxed">
                    <section>
                        <h2 className="text-lg font-semibold text-white mb-3">1. Acceptance of Terms</h2>
                        <p>
                            By accessing or using Vaidya Digital&apos;s Clip Studio platform (&quot;Service&quot;),
                            operated at vaidyadigital.com, you agree to be bound by these Terms of Service.
                            If you do not agree to these terms, please do not use the Service.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold text-white mb-3">2. Description of Service</h2>
                        <p>
                            Clip Studio is a content creation platform that enables users to generate
                            short-form video clips from long-form content. The Service includes features
                            such as AI-powered clip detection, face tracking, animated captions, and
                            social media publishing integrations with platforms including TikTok, YouTube,
                            and Instagram.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold text-white mb-3">3. User Accounts</h2>
                        <p>
                            You must create an account to use the Service. You are responsible for
                            maintaining the confidentiality of your account credentials and for all
                            activities that occur under your account. You agree to notify us immediately
                            of any unauthorized use of your account.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold text-white mb-3">4. Acceptable Use</h2>
                        <p className="mb-2">You agree not to:</p>
                        <ul className="list-disc list-inside space-y-1 text-gray-400">
                            <li>Use the Service for any unlawful purpose or in violation of any applicable laws</li>
                            <li>Upload, process, or distribute content that infringes on any third party&apos;s intellectual property rights</li>
                            <li>Use the Service to create or distribute spam, misleading, or harmful content</li>
                            <li>Attempt to reverse-engineer, decompile, or otherwise extract the source code of the Service</li>
                            <li>Interfere with or disrupt the integrity or performance of the Service</li>
                            <li>Impersonate any person or entity or misrepresent your affiliation</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold text-white mb-3">5. Content Ownership &amp; Responsibility</h2>
                        <p>
                            You retain ownership of all content you upload to or create through the Service.
                            You are solely responsible for ensuring that you have the necessary rights,
                            licenses, or permissions to use, process, and distribute any content through
                            the Service. Vaidya Digital does not claim ownership of your content.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold text-white mb-3">6. Third-Party Integrations</h2>
                        <p>
                            The Service integrates with third-party platforms including TikTok, YouTube,
                            and Instagram. Your use of these integrations is subject to the respective
                            terms and policies of those platforms. We are not responsible for the
                            availability, accuracy, or policies of any third-party services.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold text-white mb-3">7. Limitation of Liability</h2>
                        <p>
                            The Service is provided &quot;as is&quot; and &quot;as available&quot; without warranties of
                            any kind. In no event shall Vaidya Digital be liable for any indirect,
                            incidental, special, consequential, or punitive damages arising out of or
                            relating to your use of the Service.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold text-white mb-3">8. Termination</h2>
                        <p>
                            We reserve the right to suspend or terminate your account at any time for
                            violation of these terms or for any other reason at our sole discretion.
                            Upon termination, your right to use the Service will immediately cease.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold text-white mb-3">9. Changes to Terms</h2>
                        <p>
                            We may update these Terms of Service from time to time. We will notify users
                            of any material changes by posting the new terms on this page with an updated
                            revision date. Your continued use of the Service after such changes constitutes
                            your acceptance of the new terms.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-lg font-semibold text-white mb-3">10. Contact</h2>
                        <p>
                            If you have any questions about these Terms, please contact us at{" "}
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
