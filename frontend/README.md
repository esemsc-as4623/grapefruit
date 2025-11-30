# Grapefruit Frontend

React-based UI for the Grapefruit AI Shopping Assistant.

## Features

- **Inventory Dashboard**: View all items with predicted run-out dates
- **Order Review**: Approve or reject auto-generated orders
- **Preferences**: Manage spending limits and brand preferences
- **Manual Entry**: Add items to inventory manually
- **Receipt Upload**: (Coming soon) OCR-based receipt scanning

## Tech Stack

- React 18
- TailwindCSS for styling
- React Router for navigation
- Axios for API communication
- Lucide React for icons

## Development

### Local Development (without Docker)

```bash
# Install dependencies
npm install

# Start development server
npm start

# Open browser to http://localhost:3000
```

### Docker Development

```bash
# From project root
docker-compose up frontend

# Frontend will be available at http://localhost:3000
```

## Environment Variables

Create a `.env` file in the frontend directory:

```
REACT_APP_API_URL=http://localhost:5000
```

## API Integration

The frontend connects to the backend API running on port 5000. All API calls are made through the `src/services/api.js` module.

## Project Structure

```
frontend/
├── public/           # Static files
├── src/
│   ├── components/   # React components
│   │   ├── InventoryDashboard.jsx
│   │   ├── CartReview.jsx
│   │   ├── PreferencesPanel.jsx
│   │   └── ManualEntry.jsx
│   ├── services/     # API service layer
│   │   └── api.js
│   ├── App.jsx       # Main app component with routing
│   ├── index.jsx     # Entry point
│   └── index.css     # Global styles
├── package.json
├── Dockerfile
└── tailwind.config.js
```

## Available Scripts

- `npm start` - Start development server
- `npm build` - Build for production
- `npm test` - Run tests

## Browser Support

Modern browsers that support ES6+:
- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)
