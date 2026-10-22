(setq a 0)
(setq b 5)
(setq c 2)
(setq d 0)

(defun my_func ()
  (let* ((e 0)
         (f 5))
    (loop while (/= e f) do
      (format t "The value of e is:~%")
      (format t "~d" e)
      (incf e))))

(defun main ()
  (format t "Hello world!~%")
  (setf a b)
  (setf d (truncate (* b c) 10))
  (format t "~d" d)
  (my_func))

(main)
