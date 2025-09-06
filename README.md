# Node MVC Demo

Demo site with a lightweight MVC architecture using Node.js, Express.js and EJS templates.

---

[![Demo Video](public/img/demo.gif)](public/img/demo.gif)

---

## Features

- **MVC Architecture**: Clean separation of concerns with dedicated Model, View, and Controller layers
- **User Authentication**: Login system with session management
- **Role-Based Access**: Admin vs. user permissions and individual functionality
- **Dynamic Routing**: Express-based routing with parameterized URLs
- **Template Engine**: Server-side rendering with EJS templates and reusable components
- **Responsive Design**: Bootstrap-powered responsive interface
- **City Rating System**: Browse and rate cities from around the world
- **Favorites Management**: Save and manage your favorite cities

## Getting Started

1. Clone the repository
2. Install dependencies: `npm install`
3. Copy `env.demo` to `.env` and configure your settings
4. Start the server: `node listen.js`

## Configuration

The application uses environment variables for configuration. Key settings include:

- `NODE_ENV`: Environment (development/production)
- `DB_HOST`, `DB_USER`, `DB_PASSWORD`: Database connection
- `SESSION_SECRET`: Session encryption key
- `SERVER_IP`, `SERVER_PORT`: Server binding settings

## Image Credits

City images courtesy of [Pixabay](https://pixabay.com) (free for commercial use, no attribution required).