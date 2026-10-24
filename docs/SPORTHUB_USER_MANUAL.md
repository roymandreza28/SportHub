**USER MANUAL DURING DEVELOPMENT**

1. **Introduction**

This manual is designed for developers and students working on the SportHub system. It provides guidance on installing, configuring, running, and maintaining the project, including how the system is organized, how each user role works, and how development and testing are performed.

SportHub is a role-based sports management and tournament platform that supports players, coaches, venue facilitators, organizers, livestream organizers, and administrators. The system allows users to manage registrations, tournaments, venues, social interactions, livestreaming, news, and administrative controls.

2. **System Requirements**

2.1. **Hardware**

- **Processor:** Intel i5 (minimum), Intel i7 recommended
- **RAM:** 8 GB minimum, 16 GB recommended for smoother multitasking
- **Storage:** 256 GB SSD minimum, 512 GB SSD recommended
- **Graphics:** Integrated graphics sufficient; dedicated GPU optional
- **Network:** Stable internet connection for project setup, API access, and testing

2.2. **Software**

- **Operating System:** Windows 10/11, Linux, or macOS
- **Code Editor/IDE:** Visual Studio Code
- **Version Control:** Git + GitHub
- **Package Managers:** npm and Composer
- **Frameworks / Libraries:** React JS, TypeScript, Vite, Tailwind CSS, Laravel PHP, Sanctum, Spatie Permission
- **Databases:** MySQL / MariaDB / SQLite for local development
- **Web Browsers:** Chrome, Edge, Brave, Firefox

3. **Development Stack**

3.1. **Front-End**

- **Technologies:** React JS, TypeScript, Vite, Tailwind CSS
- **Purpose:** Building interactive pages for login, dashboards, sports management, social modules, and admin tools
- **Key Front-End Features:** protected routes, role-specific dashboards, tournament interfaces, venue operations, news feed, chat, and admin panels

3.2. **Back-End / Services**

- **Server Framework:** Laravel PHP
- **Authentication:** Laravel Sanctum token-based authentication
- **Authorization:** Spatie Laravel Permission for role and permission management
- **Database:** MySQL or SQLite for development
- **API Communication:** Axios from the frontend to the Laravel API
- **Real-Time Features:** Laravel Echo, Reverb, and push notifications
- **Media & Files:** Public storage for profile images, venue media, proof uploads, and QR codes

3.3. **Tools**

- **IDE:** Visual Studio Code
- **Version Control:** Git + GitHub
- **Browsers for Testing:** Chrome, Edge, Brave, Firefox
- **Build Tools:** Vite, npm, Composer
- **Testing Tools:** Vitest, Playwright, PHP testing tools

4. **Installation Guide**

**Step 1: Install Core Tools**

- **Visual Studio Code (VS Code):** Download and install from https://code.visualstudio.com
- **Git:** Install from https://git-scm.com and connect to GitHub
- **Node.js:** Install the LTS version from https://nodejs.org
- **Composer:** Install Composer for PHP package management from https://getcomposer.org
- **XAMPP / MySQL / SQLite tools:** Use local database support for Laravel development

**Step 2: Clone the Project**

- Open VS Code and open a terminal.
- Clone the project repository:

```bash
git clone <repository-url>
cd sporthub
```

**Step 3: Set Up the Front-End (React + Vite)**

- Navigate to the front-end folder:

```bash
cd web
npm install
```

- Start the development server:

```bash
npm run dev
```

- The app should run locally in the browser, usually at:

```text
http://localhost:5173
```

**Step 4: Set Up the Back-End (Laravel API)**

- Open a second terminal and navigate to the API folder:

```bash
cd api
composer install
```

- Copy the environment file:

```bash
cp .env.example .env
```

- Generate the Laravel app key:

```bash
php artisan key:generate
```

- Configure the database connection in `.env` file.

Example:

```env
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=sporthub
DB_USERNAME=root
DB_PASSWORD=
```

- Run migrations and seeders:

```bash
php artisan migrate
php artisan db:seed
```

- Start the Laravel API server:

```bash
php artisan serve
```

- The API usually runs at:

```text
http://localhost:8000
```

**Step 5: Configure Application Connectivity**

- Ensure the frontend is connected to the Laravel backend correctly.
- Check the project API base URL in the frontend configuration files.
- Make sure the environment variables for API endpoints are set correctly.

**Step 6: Run and Test**

- Start both services:
  - Front-end: `npm run dev`
  - Back-end: `php artisan serve`
- Open the app in a browser and test login, registration, and role handling.
- Verify that the user is redirected correctly based on their role.

5. **System Modules and User Roles**

SportHub consists of several user roles and modules, each with specific responsibilities.

5.1. **Player**

- Register and log in
- View available venues and tournaments
- Register for tournaments
- Create matchmaking requests
- Update profile and social details
- Interact with the news feed and chat systems

5.2. **Coach**

- Register as a coach with eligibility proof
- Also receives player permissions automatically
- Evaluate players
- Manage team and tournament registrations
- Book venues and interact with social features

5.3. **Venue Facilitator**

- Manage venue details and facilities
- Approve or reject venue bookings
- View schedules and manage bookings
- Handle news updates and venue-related tournament operations

5.4. **Main Organizer**

- Create and manage tournaments
- Assign venue organizers and livestream organizers
- Generate tournament brackets
- Update match scores and control tournament flow

5.5. **Venue Organizer**

- Manage assigned match operations
- Update live score and match progress
- Support venue-side tournament operations

5.6. **Livestream Organizer**

- Manage livestream sessions
- Start or stop broadcast events
- Moderate livestream-related chat or feed activities

5.7. **Admin**

- Manage all users and roles
- Verify registrations and proofs
- Monitor system activity
- Review public inquiries and audit logs
- Access all protected administrative functions

6. **How to Use**

**Development Workflow**

- **Plan:** Define system requirements and features based on the role modules and business processes.
- **Design:** Create UI wireframes, route structure, and database model design for the platform.
- **Code:** Build the frontend pages, backend APIs, and role-based access control.
- **Test:** Run unit tests, route checks, and UI validations for each module.
- **Deploy:** Deploy the frontend and backend to production environment or hosting services.
- **Maintain:** Fix bugs, update dependencies, and improve role functionalities over time.

**Typical User Workflow**

1. User opens the application.
2. User logs in or registers an account.
3. The system validates credentials and assigns role-based access.
4. The user is redirected to the correct dashboard based on their role.
5. The user performs actions such as joining tournaments, managing venues, registering players, updating scores, or managing administrative tasks.
6. The backend validates permissions and updates the database.
7. The frontend refreshes the page and shows the updated system state.

7. **Testing Guide**

**Front-End Testing**

- Validate route protection for every role.
- Check dashboard navigation for player, coach, facilitator, organizer, and admin.
- Test input validation for registration and profile forms.
- Confirm UI updates after API responses.

**Back-End Testing**

- Run Laravel migration and database tests.
- Validate authorization middleware for each route group.
- Check permission assignment for each role.
- Confirm admin override and protected actions are enforced properly.

**Example Testing Tasks**

- Player can register for a tournament.
- Coach can evaluate a player and create a venue registration.
- Venue facilitator can approve a booking.
- Organizer can assign staff to a tournament.
- Venue organizer can edit live match scores.
- Livestream organizer can start and stop a stream.
- Admin can review verification requests and update roles.

8. **Deployment Guide**

**Front-End Deployment**

- Build the React project for production:

```bash
npm run build
```

- Deploy the generated production files to a hosting service or static deployment platform.

**Back-End Deployment**

- Upload the Laravel project to a server or hosting platform.
- Configure the `.env` file for production database settings.
- Run migrations and seeders in the deployment environment.
- Ensure the API is accessible and secured properly.

9. **Maintenance and Support**

- Keep dependencies updated regularly.
- Monitor database performance and API logs.
- Check role permissions after feature updates.
- Review admin audit logs and user verification statuses.
- Maintain consistent naming conventions and documentation for future developers.

10. **Conclusion**

SportHub is a comprehensive sports management system designed for role-specific user experiences and operational workflow management. It combines robust frontend navigation, a Laravel-based secure backend, a role-based permission system, and a structured domain model for tournaments, users, venues, events, and social interactions.

This manual is intended to guide developers and students through installation, configuration, testing, deployment, and maintenance tasks so the system can be developed and operated efficiently.

**END OF MANUAL**
