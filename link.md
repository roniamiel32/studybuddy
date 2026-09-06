# StudyBuddy — קישורים

פרויקט גמר · טכנולוגיות אינטרנט · אוניברסיטת רייכמן
רוני עמיאל ועדן ביטרן · גרסה 0.53.2

---

## הגשה

| | |
| --- | --- |
| **אפליקציה חיה** | <https://studybuddy-one-livid.vercel.app/> |
| **מאגר GitHub** | <https://github.com/roniamiel32/studybuddy> |

הענף `main` מעודכן ומכיל את כל הקוד שרץ באפליקציה החיה.

---

## כניסה לאפליקציה

- ההרשמה פתוחה לכתובות **אקדמיות בלבד** — סיומת `.ac.il` או `.edu`. הדומיין הוא שקובע לאיזה מוסד המשתמש משתייך.
- כתובת בדומיין `@post.runi.ac.il` נוחתת בקטלוג הקורסים המלא של רייכמן. דומיין אחר יוצר מוסד חדש עם קטלוג ריק.
- לאחר ההרשמה נשלח קוד אימות בן שש ספרות לדוא״ל.

> **משתמש הדגמה לבודק:** `[להשלים — אימייל]` / `[להשלים — סיסמה]`
> מומלץ ליצור משתמש דמו בסביבה החיה ולהשלים כאן, כדי שהבודק לא יצטרך לעבור אימות דוא״ל.

---

## תיעוד במאגר

| מסמך | תוכן |
| --- | --- |
| [`README.md`](README.md) | סקירת המוצר, הרצה מקומית, ורשימת הפקודות |
| [`docs/architecture.md`](docs/architecture.md) | הארכיטקטורה כפי שנבנתה — רכיבים, סכימה, ניתובים, הרשאות |
| [`docs/technical-design.md`](docs/technical-design.md) | מסמך התכן הטכני וההחלטות שהתקבלו לאורך הפיתוח |
| [`docs/testing.md`](docs/testing.md) | אסטרטגיית הבדיקות ופירוט השכבות |
| [`docs/security.md`](docs/security.md) | מודל האבטחה — RLS, ולידציה, וטיפול בסודות |
| [`docs/scaling.md`](docs/scaling.md) | שיקולי עומס וטעינת נתונים |
| [`docs/prd.md`](docs/prd.md) · [`docs/product-requirements.md`](docs/product-requirements.md) | דרישות המוצר |
| [`CHANGELOG.md`](CHANGELOG.md) | היסטוריית הגרסאות |

---

## הרצה מקומית

דרישות מוקדמות: **Node 20.9+** ו-**Docker Desktop** (עבור סביבת Supabase המקומית).

```bash
npm install
cp .env.example .env.local
npm run db:start       # Postgres מקומי + 66 מיגרציות; מדפיס URL ומפתחות ל-.env.local
npm run dev            # http://localhost:3000
npm run seed:students  # אופציונלי — סטודנטים לדוגמה למסכי ההתאמה
```

לאימות מלא: `npm run verify` — lint, typecheck, 740 בדיקות ובנייה, בסדר הזה.
בדיקות End-to-End רצות בנפרד: `npm run test:e2e`.

הוראות מפורטות: [README › Getting started](README.md#getting-started).

---

## פריסה

- **פרונטאנד:** Vercel — כל דחיפה ל-`main` מפעילה build ופריסה אוטומטית.
- **מסד נתונים:** Supabase (PostgreSQL 17). שינויי סכימה אינם נפרסים אוטומטית ומוחלים בנפרד:

```bash
npx supabase db push
```
