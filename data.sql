SET session_replication_role = replica;

--
-- PostgreSQL database dump
--

-- \restrict AEmWdbMO0F98xCTRCkMYOeQsMXcxfTHs9vwyt0dD4Xhn3WbDO5OutRfOF3RaGaX

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: audit_log_entries; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: custom_oauth_providers; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: flow_state; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: users; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: identities; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: instances; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: oauth_clients; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: sessions; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: mfa_amr_claims; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: mfa_factors; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: mfa_challenges; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: oauth_authorizations; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: oauth_client_states; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: oauth_consents; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: one_time_tokens; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: refresh_tokens; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: sso_providers; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: saml_providers; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: saml_relay_states; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: sso_domains; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: webauthn_challenges; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: webauthn_credentials; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: universities; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: degrees; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: profiles; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: ai_generation_log; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: availability_slots; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: blocked_users; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: calendar_connections; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: courses; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: terms; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: course_offerings; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: conversations; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: study_groups; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: meetings; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: calendar_event_links; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: wall_posts; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: post_comments; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: comment_likes; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: connection_requests; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: course_posts; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: course_post_comments; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: course_comment_likes; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: course_post_likes; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: course_tips; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: course_tip_ratings; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: dismissed_meetings; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: enrollments; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: group_meeting_ratings; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: group_requests; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: messages; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: hidden_messages; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: hidden_threads; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: learning_preferences; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: match_scores; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: meeting_attendees; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: post_likes; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: profile_contacts; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: profile_private; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: study_group_members; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: study_group_messages; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: study_ratings; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: university_domains; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: buckets; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

INSERT INTO "storage"."buckets" ("id", "name", "owner", "created_at", "updated_at", "public", "avif_autodetection", "file_size_limit", "allowed_mime_types", "owner_id", "type") VALUES
	('avatars', 'avatars', NULL, '2026-08-19 11:07:49.313503+00', '2026-08-19 11:07:49.313503+00', true, false, 2097152, '{image/jpeg,image/png,image/webp}', NULL, 'STANDARD');


--
-- Data for Name: buckets_analytics; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: buckets_vectors; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: objects; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: s3_multipart_uploads; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: s3_multipart_uploads_parts; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: vector_indexes; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE SET; Schema: auth; Owner: supabase_auth_admin
--

SELECT pg_catalog.setval('"auth"."refresh_tokens_id_seq"', 1, false);


--
-- PostgreSQL database dump complete
--

-- \unrestrict AEmWdbMO0F98xCTRCkMYOeQsMXcxfTHs9vwyt0dD4Xhn3WbDO5OutRfOF3RaGaX

RESET ALL;
