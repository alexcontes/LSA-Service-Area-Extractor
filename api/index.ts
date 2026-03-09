import express from "express";
import axios from "axios";
import { OAuth2Client } from "google-auth-library";
import cors from "cors";

const app = express();
app.use(express.json());
app.use(cors());

// API Route for Google Ads Push
app.post("/api/push-to-google-ads", async (req, res) => {
  try {
    const { areas, clientId: rawClientId } = req.body;
    const clientId = rawClientId?.replace(/-/g, '');
    
    const GOOGLE_ID = process.env.GOOGLE_ID;
    const GOOGLE_SECRET = process.env.GOOGLE_SECRET;
    const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;
    const DEVELOPER_TOKEN = process.env.GOOGLE_DEVELOPER_TOKEN;
    const MANAGER_ID = process.env.GOOGLE_MANAGER_ID?.replace(/-/g, '');
    
    const BASE_URL = "https://googleads.googleapis.com/v20";

    if (!GOOGLE_ID || !GOOGLE_SECRET || !REFRESH_TOKEN || !DEVELOPER_TOKEN || !MANAGER_ID) {
      return res.status(500).json({ error: "Missing Google Ads configuration in environment variables." });
    }

    if (!clientId) {
      return res.status(400).json({ error: "Missing Client Customer ID." });
    }

    const oauth2Client = new OAuth2Client(GOOGLE_ID, GOOGLE_SECRET);
    oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });
    const { token } = await oauth2Client.getAccessToken();

    if (!token) {
      throw new Error("Failed to get access token from Google OAuth");
    }

    const operations: any[] = [];

    for (const area of areas) {
      try {
        let searchQuery = '';
        const escapedName = area.name.replace(/'/g, "\\'");
        const escapedState = area.state?.replace(/'/g, "\\'");

        if (area.type === 'Zip Code') {
          searchQuery = `
            SELECT geo_target_constant.resource_name 
            FROM geo_target_constant 
            WHERE geo_target_constant.name = '${escapedName}' 
            AND geo_target_constant.country_code = 'US'
            AND geo_target_constant.target_type = 'Postal Code'
            AND geo_target_constant.status = 'ENABLED'
            LIMIT 1
          `;
        } else {
          const canonicalPattern = `${escapedName},${escapedState},United States`;
          searchQuery = `
            SELECT geo_target_constant.resource_name 
            FROM geo_target_constant 
            WHERE geo_target_constant.canonical_name = '${canonicalPattern}'
            AND geo_target_constant.status = 'ENABLED'
            LIMIT 1
          `;
        }

        const searchUrl = `${BASE_URL}/customers/${MANAGER_ID}/googleAds:search`;
        const searchResponse = await axios.post(
          searchUrl,
          { query: searchQuery },
          {
            headers: {
              "Authorization": `Bearer ${token}`,
              "developer-token": DEVELOPER_TOKEN,
              "login-customer-id": MANAGER_ID
            }
          }
        );

        const results = searchResponse.data.results;
        if (results && results.length > 0) {
          const resourceName = results[0].geoTargetConstant.resourceName;
          operations.push({
            create: {
              campaign: `customers/${clientId}/campaigns/REPLACE_WITH_CAMPAIGN_ID`,
              location: {
                geoTargetConstant: resourceName
              }
            }
          });
        }
      } catch (err) {
        console.error(`Error searching for ${area.name}:`, err);
      }
    }

    const campaignQuery = `
      SELECT campaign.id, campaign.name 
      FROM campaign 
      WHERE campaign.advertising_channel_type = 'LOCAL_SERVICES' 
      AND campaign.status = 'ENABLED' 
      LIMIT 1
    `;

    const campaignSearchUrl = `${BASE_URL}/customers/${clientId}/googleAds:search`;
    const campaignResponse = await axios.post(
      campaignSearchUrl,
      { query: campaignQuery },
      {
        headers: {
          "Authorization": `Bearer ${token}`,
          "developer-token": DEVELOPER_TOKEN,
          "login-customer-id": MANAGER_ID
        }
      }
    );

    const campaigns = campaignResponse.data.results;
    if (!campaigns || campaigns.length === 0) {
      return res.status(404).json({ error: "No active Local Services campaign found for this client." });
    }

    const campaignId = campaigns[0].campaign.id;
    const campaignResourceName = `customers/${clientId}/campaigns/${campaignId}`;

    const finalOperations = operations.map(op => ({
      create: {
        ...op.create,
        campaign: campaignResourceName
      }
    }));

    if (finalOperations.length === 0) {
      return res.status(400).json({ error: "No valid geographic targets found for the selected areas." });
    }

    const mutateUrl = `${BASE_URL}/customers/${clientId}/campaignCriteria:mutate`;
    const mutateResponse = await axios.post(
      mutateUrl,
      { operations: finalOperations },
      {
        headers: {
          "Authorization": `Bearer ${token}`,
          "developer-token": DEVELOPER_TOKEN,
          "login-customer-id": MANAGER_ID
        }
      }
    );

    res.json({ 
      success: true, 
      message: `Successfully pushed ${finalOperations.length} areas to campaign ${campaignId}`,
      details: mutateResponse.data 
    });

  } catch (error: any) {
    console.error("Google Ads Push Error:", error.response?.data || error.message);
    res.status(500).json({ 
      error: "Failed to push to Google Ads", 
      details: error.response?.data || error.message 
    });
  }
});

export default app;
