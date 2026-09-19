# Problem

During the winter months, air quality in Delhi, NCR heavily impacts logitics and delivery services. Companies need to dynamically route their delivery fleets not just based on traffic, but to avoid sending unmasked riders into micro-zones with severe AQI spikes, while still hitting their delivery windows.

# The challenge

To build a "Eco-Route" logistics dashboard. The graph should map neighborhoods as nodes (1km radius) connected by roads (Relationships weighted by distance). The nodes AQI will be updated every few minutes from AQI syncing worker. The graph should be able to find the shortest path between two nodes based on the AQI and distance.

# Tech Stack

- Express.js
- Neo4j
- React.js

# Dataset

- List of areas as 1km radius circle, with centroid (latitude, longitude) as geohash
- Roads between the areas ( Relationships weighted by distance)
- AQI data for latitude and longitude
- Store the list of areas as JSON array (areaId: num, latitude: num, longitude: num) to render in the UI dashboard

# Functionality/Flow

- Get top 5 paths with least AQI, distance
- Path length should not be more than 30% of the shortest path (variation is configurable on API)
- AQI should be less than 400. If it is more, return the path with a flag "AQI_HIGH".
  <!-- - Recalculate the path dynamically if AQI data change for considered nodes/path. -->
