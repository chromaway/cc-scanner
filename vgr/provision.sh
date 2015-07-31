apt-get update

apt-get install -y git
apt-get install -y nodejs
apt-get install -y nodejs-legacy
apt-get install -y npm

apt-get install -y postgresql
##sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD 'somepassword';"
sudo -u postgres psql -c "CREATE USER vagrant WITH PASSWORD 'somepassword';"
sudo -u postgres psql -c "CREATE DATABASE cc_scanner;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE cc_scanner TO vagrant;"


add-apt-repository -y ppa:bitcoin/bitcoin
apt-get update
apt-get install -y bitcoind





cd /vagrant/
npm install
