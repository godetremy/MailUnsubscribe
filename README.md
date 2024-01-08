# Email Unsubscribe Script

This Node.js script is designed to help you unsubscribe from unwanted emails by automating the process. It connects to your IMAP email server, searches for emails containing unsubscribe information, and provides options to unsubscribe using different methods.

## Prerequisites

Before using the script, ensure you have the following dependencies installed:

- [Node.js](https://nodejs.org/) (v14.0.0 or later)
- [npm](https://www.npmjs.com/) (Node.js package manager)

## Installation

1. Clone the repository or download the script.
2. Open a terminal and navigate to the script's directory.
3. Install the required Node.js packages by running:

    ```bash
    npm install
    ```

## Usage

1. Run the script by executing the following command:

    ```bash
    node index.js
    ```

2. The script will prompt you for your email credentials and server information. You can either use the default values or enter your own.

3. Once connected to the IMAP server, the script will identify emails with potential unsubscribe information.

4. Review the found emails and decide whether you want to send unsubscribe requests via email or through web links.

5. The script will display progress bars for the unsubscribe process, providing updates on sent emails and successful unsubscribes.

**Note:** The script will mark unsubscribed emails as deleted on the server.

## Configuration

The script uses a configuration file named `login.json` to store your email login information and preferences. If the file is not found, the script will prompt you for the necessary details.

Additionally, server configurations are stored in `serverList.json`. You can customize this file to include server aliases, IMAP, and SMTP settings.

## Important

- Use this script responsibly, as unsubscribing from emails may have consequences.
- Always review the emails identified for potential unsubscribes before proceeding.
- Make sure your email credentials are kept secure, and avoid sharing sensitive information.

## License
This script is provided under the [MIT License](LICENSE). Feel free to modify and distribute it as needed.