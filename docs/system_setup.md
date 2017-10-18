# Building a Slicing Server

Notes for setting up a Slicing Server.

### Login to the AWS EC2 instance

Log in to the AWS EC2 instance where you wish to build the container.

### Update the AWS EC2 instance

	sudo yum update

### Harden

Do some basic TCP hardening by adding some safe guards against
TCP half-open attacks -- so called "SYN" attacks as the involve
a remote attacker starting to open a TCP connection and then
abandoning it, leaving it in the "SYN_RECV" state.

Edit `/etc/sysctl.conf` and find the line

	 net.ipv4.tcp_syncookies = 1

Below that line add the additional lines

	net.ipv4.tcp_synack_retries = 3
	net.ipv4.netfilter.ip_conntrack_tcp_timeout_syn_recv = 45
	net.ipv4.conf.all.rp_filter = 1

If that `net.ipv4.tcp_syncookies = 1` line is not present, then add it as
well.  You can put all the rules at the end of the file if you
wish.

Once the file is saved, issue the command

	 sudo sysctl -p /etc/sysctl.conf

That updates the kernel with the new settings.

Next add some firewall rules to address TCP SYN attacks as well.
Issue the commands

	  sudo iptables -A INPUT -m state --state INVALID -j DROP
	  sudo iptables -A FORWARD -m state --state INVALID -j DROP
	  sudo iptables -A OUTPUT -m state --state INVALID -j DROP
	  sudo iptables -N syn_flood
	  sudo iptables -A syn_flood -m limit --limit 90/s --limit-burst 150 -j RETURN
	  sudo iptables -A syn_flood -j DROP
	  sudo iptables -A syn_flood -j LOG --log-prefix "SYN flood: "
	  sudo iptables-save > /etc/iptables.conf

Then edit `/etc/rc.local` and add the line

	 iptables-restore < /etc/iptables.conf

That will instantiate the firewall rules at boot time.

### Install fail2ban for security

Fail2ban is a widely use service which monitors available log files
for authentication failures and reacts by adding and removing firewall
rules in iptables.  Install it, start it running, and configure it
to start on system boot:

    sudo yum install -y fail2ban
	sudo service fail2ban start

	# On Amazon Linux AMI
	sudo chkconfig fail2ban on

	# On Ubuntu
	# sudo update-rc.d fail2ban defaults


### Log file rotation

Configure logrotate to rotate the yunshiquan log files which forever will
produces.   Use of `copytruncate` is critical for the log files produced
by forever.

    sudo su
    cat > /etc/logrotate.d/slicing
    /var/log/slicing.log
    /var/log/slicing-stderr.log
    /var/log/slicing-stdout.log {
      daily
      rotate 10
      missingok
      notifempty
      compress
      sharedscripts
      copytruncate
      dateext
      dateformat %Y-%m-%d.
    }
    ^d
    exit

Note that logrotate is a cron job and not a daemon.  You do not need to
SIGHUP logrotate to get it to reload its configuration: there's no daemon
to send the signal to.


### Install node 6.9.x

	sudo su root
	curl --silent --location https://rpm.nodesource.com/setup_6.x | bash -
	yum -y install nodejs
	exit


### Install git and other tools

	sudo yum groupinstall "Development Tools"
	sudo yum install -y git libtool cmake
	sudo npm install -g forever


### Install and build Protocol Buffers (used by CuraEngine)

Install Protocol Buffers from
[https://github.com/google/protobuf/release](https://github.com/google/protobuf/release).  Then

    cd protobuf-3.3.0
	./autogen.sh
	./configure
	make
	sudo make install


### Install and build libArcus (used by CuraEngine)

    git clone https://github.com/Ultimaker/libArcus.git
	cd libArcus

Then edit CMakeLists.txt and set BUILD_PYTHON OFF.  Once that
is done,

    mkdir build
    cd build
    cmake ..
    make
    sudo make install


### Clone the final 15.04 CuraEngine

    git clone -b "15.04.6" https://github.com/Ultimaker/CuraEngine.git
	cd CuraEngine

Remove the --static from the Makefile file,

    % diff Makefile Makefile.orig
    50c50
    < 			# LDFLAGS += --static
    ---
    > 			LDFLAGS += --static
    53,54c53
    < 			# LDFLAGS += --static -flto
    < 			LDFLAGS += -flto
    ---
    > 			LDFLAGS += --static -flto

And then build

    make
    sudo cp build/CuraEngine /usr/local/bin/CuraEngine
	chmod a+rx /usr/local/bin/CuraEngine
 

### Clone the Slicing Server repo

	git clone https://github.com/Polar3D/slicing.git


### Set up `src/config/`

Set up a production.js or development.js config file.  Use
`src/config/development.sample.js` as a starting point.

To select which to use when running, set the `NODE_ENV`
environment variable.  E.g.,

    NODE_ENV=production node server.js

will start the server running using `production.js` from `src/config`.

### Running the Slicing Server

Modify `start_server.sample.sh` as you see fit, rename it to
`start_server.sh`, and run it

    cd slicing
	chmod a+x ./start_server.sh
	sudo ./start_server.sh

The `start_server.sh` script can also be used to restart the server.


### Handling reboots

So that the server is restarted on a reboot, use the `@reboot` function
of cron.   Create, for the root user, a crontab containing a command
to run `/home/ec2-user/slicing/start_server.sh`:

    sudo su
    EDITOR=nano crontab -e

In the crontab, place the line

    @reboot /home/ec2-user/slicing/start_server.sh

then save the file and exit nano.  Then exit su mode by typing

    exit


